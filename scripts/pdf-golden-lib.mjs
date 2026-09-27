export function parsePpm(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('PPM input must be a Buffer.');
  let offset = 0;
  const nextToken = () => {
    while (offset < buffer.length) {
      const byte = buffer[offset];
      if (isWhitespace(byte)) {
        offset += 1;
        continue;
      }
      if (byte === 0x23) {
        while (offset < buffer.length && buffer[offset] !== 0x0a) offset += 1;
        continue;
      }
      break;
    }
    const start = offset;
    while (offset < buffer.length && !isWhitespace(buffer[offset]) && buffer[offset] !== 0x23) {
      offset += 1;
    }
    if (start === offset) throw new Error('Unexpected end of PPM header.');
    return buffer.toString('ascii', start, offset);
  };

  const magic = nextToken();
  const width = Number.parseInt(nextToken(), 10);
  const height = Number.parseInt(nextToken(), 10);
  const maximum = Number.parseInt(nextToken(), 10);
  if (magic !== 'P6') throw new Error(`Unsupported PPM format: ${magic}.`);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('PPM dimensions must be positive integers.');
  }
  if (maximum !== 255) throw new Error(`Unsupported PPM channel maximum: ${maximum}.`);
  if (!isWhitespace(buffer[offset])) throw new Error('PPM header is missing the pixel delimiter.');
  offset += buffer[offset] === 0x0d && buffer[offset + 1] === 0x0a ? 2 : 1;

  const expectedLength = width * height * 3;
  const pixels = buffer.subarray(offset);
  if (pixels.length !== expectedLength) {
    throw new Error(`PPM pixel length is ${pixels.length}; expected ${expectedLength}.`);
  }
  return { width, height, pixels };
}

export function comparePpmImages(referenceBuffer, actualBuffer, options = {}) {
  const reference = parsePpm(referenceBuffer);
  const actual = parsePpm(actualBuffer);
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error(
      `PPM dimensions differ: ${reference.width}x${reference.height} versus ${actual.width}x${actual.height}.`,
    );
  }
  const channelTolerance = options.channelTolerance ?? 0;
  let changedPixels = 0;
  let totalChannelDelta = 0;
  let maximumChannelDelta = 0;
  for (let index = 0; index < reference.pixels.length; index += 3) {
    let pixelChanged = false;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(reference.pixels[index + channel] - actual.pixels[index + channel]);
      totalChannelDelta += delta;
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      if (delta > channelTolerance) pixelChanged = true;
    }
    if (pixelChanged) changedPixels += 1;
  }
  const totalPixels = reference.width * reference.height;
  return {
    width: reference.width,
    height: reference.height,
    changedPixels,
    totalPixels,
    changedFraction: changedPixels / totalPixels,
    meanChannelDelta: totalChannelDelta / (totalPixels * 3),
    maximumChannelDelta,
  };
}

export function countDarkPixelsInRegion(buffer, region) {
  const image = parsePpm(buffer);
  const left = normalizedPixel(region.left, image.width, Math.floor);
  const top = normalizedPixel(region.top, image.height, Math.floor);
  const right = normalizedPixel(region.right, image.width, Math.ceil);
  const bottom = normalizedPixel(region.bottom, image.height, Math.ceil);
  if (right <= left || bottom <= top) throw new Error('Raster crop must have positive area.');
  const threshold = region.channelThreshold ?? 64;
  let darkPixels = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 3;
      const average = (
        image.pixels[offset]
        + image.pixels[offset + 1]
        + image.pixels[offset + 2]
      ) / 3;
      if (average <= threshold) darkPixels += 1;
    }
  }
  return darkPixels;
}

export function parsePdfInfo(output) {
  const pages = /^Pages:\s+(\d+)$/m.exec(output);
  const size = /^Page size:\s+([\d.]+) x ([\d.]+) pts(?: \(([^)]+)\))?$/m.exec(output);
  if (!pages || !size) throw new Error('Poppler pdfinfo output is missing pages or page size.');
  return {
    pages: Number.parseInt(pages[1], 10),
    widthPoints: Number.parseFloat(size[1]),
    heightPoints: Number.parseFloat(size[2]),
    pageLabel: size[3] ?? null,
  };
}

export function summarizeTectonicLog(log) {
  const lines = log.split(/\r?\n/u);
  return {
    errorCount: lines.filter((line) => /^error:/u.test(line)).length,
    fontFallbackCount: lines.filter(
      (line) => /Font shape .* (?:undefined|not available)/iu.test(line),
    ).length,
    warningCount: lines.filter((line) => /^warning:/u.test(line)).length,
    missingCharacterCount: lines.filter((line) => /Missing character:/u.test(line)).length,
  };
}

function isWhitespace(byte) {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x0c;
}

function normalizedPixel(value, dimension, round) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Raster crop coordinates must be between 0 and 1.');
  }
  return Math.min(dimension, round(value * dimension));
}
