import { comparePpmImages, parsePpm } from './pdf-golden-lib.mjs';

export const REQUIRED_BLOCK_FIDELITY_IDS = Object.freeze([
  'cover',
  'toc',
  'list-of-figures',
  'list-of-tables',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'theorem',
  'property',
  'proposition',
  'corollary',
  'lemma',
  'exercise',
  'equation',
  'figure-caption',
  'table-caption',
  'listing',
  'page-break',
  'header',
  'footer',
]);

export function validateBlockFidelityManifest(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object') throw new TypeError('Manifest must be an object.');
  if (manifest.schemaVersion !== 1) throw new Error('Block fidelity manifest schemaVersion must be 1.');
  validateRaster(manifest.raster);
  if (!Array.isArray(manifest.blocks)) throw new Error('Block fidelity manifest blocks must be an array.');

  const seen = new Set();
  for (const block of manifest.blocks) {
    if (!block || typeof block !== 'object') throw new Error('Every block measurement must be an object.');
    if (typeof block.id !== 'string' || block.id.length === 0) throw new Error('Every block requires an id.');
    if (seen.has(block.id)) throw new Error(`Duplicate block fidelity measurement: ${block.id}.`);
    seen.add(block.id);
    if (!Number.isInteger(block.visualPage) || block.visualPage < 1) {
      throw new Error(`${block.id} visualPage must be a positive integer.`);
    }
    if (!Number.isInteger(block.pdfPage) || block.pdfPage < 1) {
      throw new Error(`${block.id} pdfPage must be a positive integer.`);
    }
    validateRegion(block.region, block.id);
    if (block.comparison !== 'raster' && block.comparison !== 'structural') {
      throw new Error(`${block.id} comparison must be raster or structural.`);
    }
    if (block.comparison === 'raster'
      && (!Number.isFinite(block.maxChangedFraction)
        || block.maxChangedFraction < 0
        || block.maxChangedFraction > 1)) {
      throw new Error(`${block.id} maxChangedFraction must be between 0 and 1.`);
    }
  }

  if (options.requireComplete !== false) {
    const missing = REQUIRED_BLOCK_FIDELITY_IDS.filter((id) => !seen.has(id));
    if (missing.length > 0) {
      throw new Error(`Missing required block measurements: ${missing.join(', ')}.`);
    }
  }
  return manifest;
}

export function cropPpmImage(buffer, region) {
  validateRegion(region, 'crop');
  const image = parsePpm(buffer);
  const left = Math.floor(region.left * image.width);
  const top = Math.floor(region.top * image.height);
  const right = Math.ceil(region.right * image.width);
  const bottom = Math.ceil(region.bottom * image.height);
  const width = right - left;
  const height = bottom - top;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((top + y) * image.width + left) * 3;
    const targetStart = y * width * 3;
    image.pixels.copy(pixels, targetStart, sourceStart, sourceStart + width * 3);
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), pixels]);
}

export function convertAsciiPpmToBinary(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('ASCII PPM input must be a Buffer.');
  const tokens = buffer.toString('ascii').replace(/^\s*#.*$/gmu, ' ').trim().split(/\s+/u);
  const [magic, widthText, heightText, maximumText, ...channelTokens] = tokens;
  if (magic !== 'P3') throw new Error(`Unsupported ASCII PPM format: ${magic ?? 'missing'}.`);
  const width = Number.parseInt(widthText, 10);
  const height = Number.parseInt(heightText, 10);
  const maximum = Number.parseInt(maximumText, 10);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error('ASCII PPM dimensions must be positive integers.');
  }
  if (maximum !== 255) throw new Error(`Unsupported ASCII PPM channel maximum: ${maximum}.`);
  const expectedChannels = width * height * 3;
  if (channelTokens.length !== expectedChannels) {
    throw new Error(`ASCII PPM has ${channelTokens.length} channels; expected ${expectedChannels}.`);
  }
  const pixels = Buffer.from(channelTokens.map((token) => {
    const value = Number.parseInt(token, 10);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`Invalid ASCII PPM channel value: ${token}.`);
    }
    return value;
  }));
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), pixels]);
}

export function auditBlockFidelity({
  manifest,
  visualPages,
  pdfPages,
  requireCompleteManifest = true,
  generatedAt = new Date().toISOString(),
}) {
  validateBlockFidelityManifest(manifest, { requireComplete: requireCompleteManifest });
  const measurements = manifest.blocks.map((block) => {
    if (block.comparison === 'structural') {
      return { id: block.id, status: 'structural-only' };
    }
    const visual = requiredPage(visualPages, block.visualPage, 'Visual', block.id);
    const pdf = requiredPage(pdfPages, block.pdfPage, 'PDF', block.id);
    const comparison = comparePpmImages(
      cropPpmImage(visual, block.region),
      cropPpmImage(pdf, block.region),
      { channelTolerance: manifest.raster.channelTolerance },
    );
    return {
      id: block.id,
      status: comparison.changedPixels === 0 ? 'exact' : 'different',
      maxChangedFraction: block.maxChangedFraction,
      withinThreshold: comparison.changedFraction <= block.maxChangedFraction,
      ...comparison,
    };
  });
  const rasterMeasurements = measurements.filter((measurement) => measurement.status !== 'structural-only');
  return {
    generatedAt,
    rasterWidth: manifest.raster.width,
    rasterHeight: manifest.raster.height,
    exactRasterMatches: rasterMeasurements.filter((measurement) => measurement.status === 'exact').length,
    rasterMeasurements: rasterMeasurements.length,
    measurements,
  };
}

export function formatBlockFidelityMarkdown(result) {
  const lines = [
    '# Block visual fidelity audit',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    `Raster: ${result.rasterWidth} x ${result.rasterHeight} px. Exact raster matches: ${result.exactRasterMatches}/${result.rasterMeasurements}.`,
    '',
    'A zero changed-pixel result is exact for the measured crop at this renderer, raster size, and tolerance. Any non-zero result must not be described as pixel-perfect. These measurements must not be interpreted as proof that editable DOM and TeX are identical across fonts, operating systems, browsers, or TeX engines.',
    '',
    '| Block | Status | Gate | Changed pixels | Changed fraction | Limit | Mean channel delta | Max channel delta |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const measurement of result.measurements) {
    if (measurement.status === 'structural-only') {
      lines.push(`| ${measurement.id} | structural-only | - | - | - | - | - | - |`);
      continue;
    }
    lines.push([
      `| ${measurement.id}`,
      measurement.status,
      measurement.withinThreshold ? 'within' : 'exceeded',
      measurement.changedPixels,
      `${(measurement.changedFraction * 100).toFixed(4)}%`,
      `${(measurement.maxChangedFraction * 100).toFixed(4)}%`,
      measurement.meanChannelDelta.toFixed(4),
      `${measurement.maximumChannelDelta} |`,
    ].join(' | '));
  }
  return `${lines.join('\n')}\n`;
}

function validateRaster(raster) {
  if (!raster || typeof raster !== 'object') throw new Error('Manifest raster settings are required.');
  for (const key of ['width', 'height']) {
    if (!Number.isInteger(raster[key]) || raster[key] < 1) {
      throw new Error(`Manifest raster ${key} must be a positive integer.`);
    }
  }
  if (!Number.isInteger(raster.channelTolerance) || raster.channelTolerance < 0 || raster.channelTolerance > 255) {
    throw new Error('Manifest raster channelTolerance must be an integer from 0 through 255.');
  }
}

function validateRegion(region, id) {
  if (!region || typeof region !== 'object') throw new Error(`${id} requires a normalized crop region.`);
  for (const key of ['left', 'top', 'right', 'bottom']) {
    if (!Number.isFinite(region[key]) || region[key] < 0 || region[key] > 1) {
      throw new Error(`${id} crop ${key} must be between 0 and 1.`);
    }
  }
  if (region.right <= region.left || region.bottom <= region.top) {
    throw new Error(`${id} crop region must have positive area.`);
  }
}

function requiredPage(pages, page, renderer, id) {
  const raster = pages instanceof Map ? pages.get(page) : pages?.[page];
  if (!Buffer.isBuffer(raster)) throw new Error(`${renderer} page ${page} is missing for ${id}.`);
  return raster;
}
