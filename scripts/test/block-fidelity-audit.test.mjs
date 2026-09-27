import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_BLOCK_FIDELITY_IDS,
  auditBlockFidelity,
  convertAsciiPpmToBinary,
  cropPpmImage,
  formatBlockFidelityMarkdown,
  validateBlockFidelityManifest,
} from '../block-fidelity-audit.mjs';

function ppm(width, height, pixels) {
  return Buffer.concat([
    Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'),
    Buffer.from(pixels),
  ]);
}

function completeManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    raster: { width: 2, height: 2, channelTolerance: 0 },
    blocks: REQUIRED_BLOCK_FIDELITY_IDS.map((id, index) => ({
      id,
      visualPage: index + 1,
      pdfPage: index + 1,
      region: { left: 0, top: 0, right: 1, bottom: 1 },
      comparison: id === 'page-break' ? 'structural' : 'raster',
      ...(id === 'page-break' ? {} : { maxChangedFraction: 1 }),
    })),
    ...overrides,
  };
}

test('manifest requires one deterministic measurement for every requested block', () => {
  const manifest = completeManifest();
  manifest.blocks = manifest.blocks.filter((block) => block.id !== 'lemma');

  assert.throws(
    () => validateBlockFidelityManifest(manifest),
    /missing required block measurements: lemma/i,
  );
});

test('manifest requires an approved changed-pixel ceiling for every raster block', () => {
  const manifest = completeManifest();
  delete manifest.blocks.find((block) => block.id === 'theorem').maxChangedFraction;

  assert.throws(
    () => validateBlockFidelityManifest(manifest),
    /theorem maxChangedFraction must be between 0 and 1/i,
  );
});

test('cropPpmImage extracts the same normalized region used for both renderers', () => {
  const image = ppm(2, 2, [
    1, 2, 3, 4, 5, 6,
    7, 8, 9, 10, 11, 12,
  ]);

  const crop = cropPpmImage(image, { left: 0.5, top: 0, right: 1, bottom: 1 });

  assert.deepEqual([...crop], [
    ...Buffer.from('P6\n1 2\n255\n', 'ascii'),
    4, 5, 6,
    10, 11, 12,
  ]);
});

test('audit calls a raster exact only when changed pixels are zero', () => {
  const white = ppm(2, 2, Array(12).fill(255));
  const changed = ppm(2, 2, [
    254, 255, 255,
    ...Array(9).fill(255),
  ]);
  const manifest = completeManifest({
    blocks: [
      {
        id: 'heading-1',
        visualPage: 1,
        pdfPage: 1,
        region: { left: 0, top: 0, right: 1, bottom: 1 },
        comparison: 'raster',
        maxChangedFraction: 0.2,
      },
      {
        id: 'page-break',
        visualPage: 1,
        pdfPage: 1,
        region: { left: 0, top: 0, right: 1, bottom: 1 },
        comparison: 'structural',
      },
    ],
  });

  const result = auditBlockFidelity({
    manifest,
    visualPages: new Map([[1, white]]),
    pdfPages: new Map([[1, changed]]),
    requireCompleteManifest: false,
  });

  assert.equal(result.measurements[0].status, 'different');
  assert.equal(result.measurements[0].changedPixels, 1);
  assert.equal(result.measurements[0].maxChangedFraction, 0.2);
  assert.equal(result.measurements[0].withinThreshold, false);
  assert.equal(result.measurements[1].status, 'structural-only');
  assert.equal(result.exactRasterMatches, 0);
});

test('ASCII P3 screenshots are normalized to binary P6 for the shared comparator', () => {
  const ascii = Buffer.from('P3\n# sips output\n2 1\n255\n255 0 1 2 3 4\n', 'ascii');

  const binary = convertAsciiPpmToBinary(ascii);

  assert.deepEqual([...binary], [
    ...Buffer.from('P6\n2 1\n255\n', 'ascii'),
    255, 0, 1, 2, 3, 4,
  ]);
});

test('Markdown report states the editable DOM versus TeX raster limitation', () => {
  const markdown = formatBlockFidelityMarkdown({
    generatedAt: '2026-08-25T00:00:00.000Z',
    rasterWidth: 816,
    rasterHeight: 1154,
    exactRasterMatches: 0,
    rasterMeasurements: 1,
    measurements: [{
      id: 'heading-1',
      status: 'different',
      changedPixels: 42,
      totalPixels: 100,
      changedFraction: 0.42,
      maxChangedFraction: 0.5,
      withinThreshold: true,
      meanChannelDelta: 2,
      maximumChannelDelta: 8,
    }],
  });

  assert.match(markdown, /must not be interpreted as proof that editable DOM and TeX are identical/i);
  assert.match(markdown, /heading-1.*42\.0000%/i);
  assert.match(markdown, /heading-1.*within.*50\.0000%/i);
});
