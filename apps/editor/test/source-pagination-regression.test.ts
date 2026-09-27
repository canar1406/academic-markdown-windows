import { describe, expect, it } from 'vitest';
import { calculateSourcePageLayout } from '../src/source-editor';

const geometry = {
  pageHeight: 816 * 297 / 210,
  pageGap: 24,
  lineHeight: 23.09375,
  paddingTop: 28,
  paddingBottom: 80,
};

describe('Source pagination without decorated-height feedback', () => {
  it('uses whole A4 sheets and counts each inserted gap only once', () => {
    const layout = calculateSourcePageLayout(1431, geometry);
    const contentHeight = 1431 * geometry.lineHeight + geometry.paddingTop
      + geometry.paddingBottom + layout.breaks.reduce((sum, gap) => sum + gap.height, 0);
    const slot = geometry.pageHeight + geometry.pageGap;
    expect(layout.breaks.length).toBeGreaterThan(25);
    expect(layout.stackHeight).toBe(Math.ceil((contentHeight + geometry.pageGap) / slot)
      * slot - geometry.pageGap);
    expect(layout.stackHeight - contentHeight).toBeLessThan(slot);
  });

  it.each([816, 600, 600.5])('keeps every line inside paper at layout width %s', (width) => {
    const metrics = { ...geometry, pageHeight: width * 297 / 210 };
    const layout = calculateSourcePageLayout(5000, metrics);
    const gaps = new Map(layout.breaks.map((gap) => [gap.lineNumber, gap.height]));
    const slot = metrics.pageHeight + metrics.pageGap;
    let top = metrics.paddingTop;
    for (let line = 1; line <= 5000; line += 1) {
      top += gaps.get(line) ?? 0;
      const offset = top % slot;
      expect(offset + metrics.lineHeight).toBeLessThanOrEqual(metrics.pageHeight + 0.001);
      top += metrics.lineHeight;
    }
  });

  it('is deterministic without previous widgets, viewport, or transformed content height', () => {
    const expected = calculateSourcePageLayout(1431, geometry);
    for (let frame = 0; frame < 90; frame += 1) {
      expect(calculateSourcePageLayout(1431, geometry)).toEqual(expected);
    }
  });

  it('does not push an exactly fitting line onto a new sheet', () => {
    const layout = calculateSourcePageLayout(4, {
      pageHeight: 60, pageGap: 24, lineHeight: 20, paddingTop: 0, paddingBottom: 0,
    });
    expect(layout.breaks).toEqual([{ lineNumber: 4, height: 24 }]);
    expect(layout.stackHeight).toBe(144);
  });
});
