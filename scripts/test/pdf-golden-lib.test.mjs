import assert from 'node:assert/strict';
import test from 'node:test';
import {
  comparePpmImages,
  countDarkPixelsInRegion,
  parsePdfInfo,
  parsePpm,
  summarizeTectonicLog,
} from '../pdf-golden-lib.mjs';

function ppm(width, height, pixels) {
  return Buffer.concat([
    Buffer.from(`P6\n# fixture\n${width} ${height}\n255\n`, 'ascii'),
    Buffer.from(pixels),
  ]);
}

test('parsePpm decodes a binary P6 raster with comments', () => {
  const image = parsePpm(ppm(2, 1, [255, 255, 255, 0, 10, 20]));

  assert.equal(image.width, 2);
  assert.equal(image.height, 1);
  assert.deepEqual([...image.pixels], [255, 255, 255, 0, 10, 20]);
});

test('comparePpmImages reports only pixels beyond the channel tolerance', () => {
  const reference = ppm(2, 1, [255, 255, 255, 10, 20, 30]);
  const actual = ppm(2, 1, [253, 255, 254, 10, 25, 30]);

  const comparison = comparePpmImages(reference, actual, { channelTolerance: 3 });

  assert.equal(comparison.changedPixels, 1);
  assert.equal(comparison.totalPixels, 2);
  assert.equal(comparison.changedFraction, 0.5);
  assert.equal(comparison.maximumChannelDelta, 5);
});

test('comparePpmImages rejects mismatched page dimensions', () => {
  assert.throws(
    () => comparePpmImages(
      ppm(1, 1, [0, 0, 0]),
      ppm(2, 1, [0, 0, 0, 0, 0, 0]),
    ),
    /dimensions differ/,
  );
});

test('countDarkPixelsInRegion measures ink only inside the normalized crop', () => {
  const image = ppm(2, 2, [
    255, 255, 255, 0, 0, 0,
    20, 20, 20, 250, 250, 250,
  ]);

  assert.equal(countDarkPixelsInRegion(image, {
    left: 0,
    top: 0.5,
    right: 0.5,
    bottom: 1,
    channelThreshold: 40,
  }), 1);
});

test('parsePdfInfo reads A4 geometry and page count from Poppler output', () => {
  const info = parsePdfInfo([
    'Pages:           5',
    'Page size:       595.28 x 841.89 pts (A4)',
    'PDF version:     1.5',
  ].join('\n'));

  assert.deepEqual(info, {
    pages: 5,
    widthPoints: 595.28,
    heightPoints: 841.89,
    pageLabel: 'A4',
  });
});

test('summarizeTectonicLog distinguishes missing glyphs from ordinary warnings', () => {
  const summary = summarizeTectonicLog([
    'warning: accessing absolute path `/System/Library/Fonts/Times.ttf`',
    'warning: report.tex:4: Missing character: There is no Đ in font example!',
    "warning: report.tex:8: Font shape `TU/ptm/m/n' undefined",
    "LaTeX Font Info: Font shape `OT1/ptm/bx/n' in size <10> not available",
    "(Font) Font shape `OT1/ptm/b/n' tried instead on input line 8.",
    'error: report.tex:8: Undefined control sequence',
  ].join('\n'));

  assert.equal(summary.errorCount, 1);
  assert.equal(summary.fontFallbackCount, 2);
  assert.equal(summary.missingCharacterCount, 1);
  assert.equal(summary.warningCount, 3);
});
