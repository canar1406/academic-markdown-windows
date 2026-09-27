import { describe, expect, it } from 'vitest';
import { parseFrontMatter, parseLmx, serializeLmxDocument } from '../src/index.js';

describe('large academic documents', () => {
  it('round-trips a 100-section Vietnamese fixture without losing LMX or source bytes', () => {
    const source = createLargeFixture(100);
    const startedAt = performance.now();
    const frontMatter = parseFrontMatter(source);
    const parsed = parseLmx(frontMatter.body);
    const elapsed = performance.now() - startedAt;

    expect(source.length).toBeGreaterThan(150_000);
    expect(frontMatter.valid).toBe(true);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.directives).toHaveLength(110);
    expect(serializeLmxDocument(parsed)).toBe(frontMatter.body);
    expect(source).toContain('Tiếng Việt: Trường Đại học Bách Khoa');
    expect(elapsed).toBeLessThan(5_000);
  });
});

function createLargeFixture(sectionCount: number): string {
  const parts = [
    '---',
    'lmx:',
    '  schema: 1',
    '  theme: hcmut-report-v1',
    'unknownProjectKey: preserve-me',
    '---',
    '',
  ];
  const paragraph = [
    'Tiếng Việt: Trường Đại học Bách Khoa và kỹ thuật máy tính.',
    'Đoạn văn kiểm tra Unicode, **nhấn mạnh**, $a^2 + b^2 = c^2$, liên kết và dữ liệu học thuật.',
  ].join(' ');

  for (let index = 1; index <= sectionCount; index += 1) {
    parts.push(`# Chương ${index}`, '');
    for (let paragraphIndex = 0; paragraphIndex < 10; paragraphIndex += 1) {
      parts.push(`${paragraph} Mục ${index}.${paragraphIndex + 1}.`, '');
    }
    parts.push(
      `:::theorem {#thm-${index} title="Định lý ${index}"}`,
      `Nội dung định lý ${index} phải được giữ nguyên qua vòng đời tài liệu.`,
      ':::',
      '',
    );
    if (index % 10 === 0) {
      parts.push(
        `:::listing {#lst-${index} caption="Mã kiểm tra ${index}" language="swift" lineNumbers=true}`,
        '```swift',
        `print("Chương ${index}: xin chào Việt Nam")`,
        '```',
        ':::',
        '',
      );
    }
  }
  return parts.join('\n');
}
