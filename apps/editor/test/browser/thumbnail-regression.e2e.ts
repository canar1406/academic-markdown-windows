import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface ThumbnailMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface ThumbnailProbe {
  messages: ThumbnailMessage[];
  rawThumbnails: Array<{ layoutRevision: number; pageIndex: number }>;
  violations: Array<{ directive: string; uri: string }>;
  canvasErrors: string[];
  imageErrors: string[];
  svgLengths: number[];
  layouts: number[];
}

declare global {
  interface Window {
    __thumbnailProbe: ThumbnailProbe;
  }
}

const sourceFixture = [
  ':::cover', ':::', '',
  ...Array.from({ length: 14 }, (_, index) => [
    `# Chương ${index + 1}: Nội dung tiếng Việt`,
    '',
    'Đây là nội dung thực, không phải biểu tượng trang. '.repeat(8),
    '',
    '$$',
    String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`,
    '$$',
    '',
    ':::pagebreak', ':::', '',
  ].join('\n')),
].join('\n');
// Opt-in, read-only replay: never rewrite the user's Markdown or retain it as a fixture.
const reportPath = process.env.THUMBNAIL_REPORT_PATH;
const report = reportPath ? readFileSync(reportPath, 'utf8') : null;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__thumbnailProbe = {
      messages: [], rawThumbnails: [], violations: [], canvasErrors: [], imageErrors: [], svgLengths: [], layouts: [],
    };
    Object.defineProperty(window, 'webkit', {
      configurable: true,
      value: {
        messageHandlers: {
          bridge: {
            postMessage(message: ThumbnailMessage) {
              window.__thumbnailProbe.messages.push(message);
            },
          },
        },
      },
    });
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__thumbnailProbe.violations.push({
        directive: event.effectiveDirective,
        uri: event.blockedURI,
      });
    });
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      try {
        return toDataURL.apply(this, args);
      } catch (error) {
        window.__thumbnailProbe.canvasErrors.push(String(error));
        throw error;
      }
    };
    const imageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (imageSource?.set && imageSource.get) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        get: imageSource.get,
        set(this: HTMLImageElement, value: string) {
          if (value.startsWith('data:image/svg+xml')) window.__thumbnailProbe.svgLengths.push(value.length);
          this.addEventListener('error', () => {
            window.__thumbnailProbe.imageErrors.push(value.slice(0, 100));
          }, { once: true });
          imageSource.set?.call(this, value);
        },
      });
    }
  });
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    editor?.addEventListener('visual-page-thumbnail-changed', (event) => {
      const { layoutRevision, pageIndex } = (event as CustomEvent<{
        layoutRevision: number; pageIndex: number;
      }>).detail;
      window.__thumbnailProbe.rawThumbnails.push({ layoutRevision, pageIndex });
    });
    editor?.addEventListener('visual-page-layout-committed', () => {
      window.__thumbnailProbe.layouts.push(Number(editor.dataset.pageLayoutRevision));
    });
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const evidence = await page.evaluate(() => {
    const { messages, ...probe } = window.__thumbnailProbe;
    return {
      ...probe,
      messages: messages.map(({ type, payload }) => ({
        type,
        payload: type === 'editor.pageThumbnailChanged'
          ? { ...payload, dataBase64: `${String(payload.dataBase64).length} base64 characters` }
          : type === 'editor.pageInventoryChanged' ? payload : undefined,
      })),
      fonts: document.fonts.status,
      revision: document.querySelector<HTMLElement>('#editor')?.dataset.pageLayoutRevision,
    };
  });
  await testInfo.attach('thumbnail-events', {
    body: JSON.stringify(evidence, null, 2), contentType: 'application/json',
  });
});

for (const zoom of [1, 0.5, 0.9]) {
  test(`real A4 raster at zoom ${zoom} remains bounded and contains content`, async ({ page }, testInfo) => {
    await loadAndDemand(page, sourceFixture, zoom, [0, 1, 13], 'renderer');
    for (const index of [0, 1, 13]) {
      const raster = await waitForRaster(page, index);
      expect(raster.width).toBe(240);
      expect(raster.height).toBe(339);
      expect(raster.darkPixels, `Page ${index + 1} must contain actual report content`).toBeGreaterThan(150);
      await testInfo.attach(`page-${index + 1}-zoom-${zoom}.jpg`, {
        body: Buffer.from(raster.dataBase64, 'base64'), contentType: 'image/jpeg',
      });
    }
    const probe = await page.evaluate(() => window.__thumbnailProbe);
    expect(probe.canvasErrors).toEqual([]);
    expect(probe.violations).toEqual([]);
    // A modest generated report used to produce 19MB per image by cloning all pages.
    // This ceiling fails the unpruned renderer without relying on WebKit's URL limit.
    expect(Math.max(...probe.svgLengths)).toBeLessThan(8_000_000);
    expect(probe.rawThumbnails.every(({ pageIndex }) => [0, 1, 13].includes(pageIndex))).toBe(true);
  });
}

test('zoom changes neither the report raster nor embedded logo placement', async ({ page }) => {
  await loadAndDemand(page, sourceFixture, 1, [0, 1, 13], 'renderer');
  const originals = await Promise.all([0, 1, 13].map((index) => waitForRaster(page, index)));
  for (const zoom of [0.5, 0.9]) {
    await page.evaluate((zoom) => {
      window.__thumbnailProbe.messages = [];
      window.markdownEditor?.setZoom(zoom);
      document.querySelector('#editor')?.dispatchEvent(new CustomEvent('visual-page-navigator-demand-changed', {
        detail: { pageIndices: [0, 1, 13], targetWidth: 240 },
      }));
    }, zoom);
    for (const [position, index] of [0, 1, 13].entries()) {
      const raster = await waitForRaster(page, index);
      const original = originals[position];
      if (!original) throw new Error('Missing reference raster');
      const meanDifference = raster.luminance.reduce((sum, value, pixel) => (
        sum + Math.abs(value - (original.luminance[pixel] ?? 0))
      ), 0) / raster.luminance.length;
      // Subpixel rounding in transformed image rectangles may affect a handful of
      // edge pixels; a cropped/squeezed page or displaced logo is far above this.
      expect(meanDifference, `Page ${index + 1} at zoom ${zoom}`).toBeLessThan(1);
    }
  }
});

test('empty demand cancels the remaining raster batch and fresh demand resumes', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#editor')?.addEventListener('visual-page-thumbnail-changed', () => {
      document.querySelector('#editor')?.dispatchEvent(new CustomEvent('visual-page-navigator-demand-changed', {
        detail: { pageIndices: [], targetWidth: 240 },
      }));
    }, { once: true });
  });
  await loadAndDemand(page, sourceFixture, 0.5, [0, 1, 13], 'renderer');
  await waitForRaster(page, 0);
  // Explicit finite observation window, longer than the renderer's 320ms debounce.
  await page.waitForTimeout(450);
  expect(await page.evaluate(() => window.__thumbnailProbe.rawThumbnails.map(({ pageIndex }) => pageIndex))).toEqual([0]);
  await page.evaluate(() => {
    document.querySelector('#editor')?.dispatchEvent(new CustomEvent('visual-page-navigator-demand-changed', {
      detail: { pageIndices: [13], targetWidth: 240 },
    }));
  });
  await waitForRaster(page, 13);
  expect(await page.evaluate(() => window.__thumbnailProbe.rawThumbnails.map(({ pageIndex }) => pageIndex))).toEqual([0, 13]);
});

test('native bridge forwards thumbnail demand to the renderer', async ({ page }) => {
  await loadAndDemand(page, sourceFixture, 0.5, [0, 1, 13], 'bridge');
  for (const index of [0, 1, 13]) await waitForRaster(page, index);
});

test('editing the document refreshes an already-demanded thumbnail without a new demand signal', async ({ page }) => {
  await loadAndDemand(page, sourceFixture, 0.5, [0], 'renderer');
  await waitForRaster(page, 0);
  const revisionBefore = await page.evaluate(() => (
    Number(document.querySelector<HTMLElement>('#editor')?.dataset.pageLayoutRevision)
  ));
  // Edit content without touching page-navigator demand, mirroring a user
  // typing elsewhere while the sidebar stays open on already-rendered pages.
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(`${markdown}\n\nEdited.\n`), sourceFixture);
  await expect.poll(() => page.evaluate((index) => {
    const revision = Number(document.querySelector<HTMLElement>('#editor')?.dataset.pageLayoutRevision);
    return window.__thumbnailProbe.messages.some(({ type, payload }) => (
      type === 'editor.pageThumbnailChanged' && payload.pageIndex === index && payload.layoutRevision === revision
    ));
  }, 0), { timeout: 5_000, message: 'Thumbnail for page 1 refreshed at the new layout revision' }).toBe(true);
  const revisionAfter = await page.evaluate(() => (
    Number(document.querySelector<HTMLElement>('#editor')?.dataset.pageLayoutRevision)
  ));
  expect(revisionAfter).toBeGreaterThan(revisionBefore);
});

test('read-only original report publishes first, middle and last page at zoom 0.5', async ({ page }, testInfo) => {
  test.skip(report === null, 'Set THUMBNAIL_REPORT_PATH to replay a local report read-only');
  // Page count varies per replayed report; derive demand indices instead of
  // assuming a fixed length so this test replays any real report untouched.
  const pageCount = await loadAndGetPageCount(page, report ?? '', 0.5);
  const indices = [...new Set([0, Math.floor((pageCount - 1) / 2), pageCount - 1])];
  await demandPages(page, indices, 'renderer');
  for (const index of indices) {
    const raster = await waitForRaster(page, index);
    expect(raster.darkPixels).toBeGreaterThan(150);
    await testInfo.attach(`report-page-${index + 1}.jpg`, {
      body: Buffer.from(raster.dataBase64, 'base64'), contentType: 'image/jpeg',
    });
  }
  expect(await page.evaluate(() => window.__thumbnailProbe.canvasErrors)).toEqual([]);
  expect(await page.evaluate(() => window.__thumbnailProbe.violations)).toEqual([]);
  // This harness serves the editor from http://127.0.0.1, so a replayed
  // report's relative image paths (resolved to file://) cannot load here the
  // way the native app's document-image URL scheme serves them. The raster
  // assertions above already confirm real content renders despite that.
});

async function loadAndGetPageCount(page: Page, markdown: string, zoom: number): Promise<number> {
  await page.evaluate(({ markdown, zoom }) => {
    window.markdownEditor?.loadMarkdown(markdown);
    window.markdownEditor?.setZoom(zoom);
  }, { markdown, zoom });
  await expect.poll(() => page.evaluate(() => {
    const inventory = window.__thumbnailProbe.messages
      .filter(({ type }) => type === 'editor.pageInventoryChanged').at(-1)?.payload.pages;
    return Array.isArray(inventory) ? inventory.length : 0;
  })).toBeGreaterThan(0);
  return page.evaluate(() => {
    const inventory = window.__thumbnailProbe.messages
      .filter(({ type }) => type === 'editor.pageInventoryChanged').at(-1)?.payload.pages;
    return Array.isArray(inventory) ? inventory.length : 0;
  });
}

async function demandPages(page: Page, indices: number[], transport: 'bridge' | 'renderer'): Promise<void> {
  await page.evaluate(({ pageIndices, transport }) => {
    const payload = { pageIndices, targetWidth: 240 };
    if (transport === 'bridge') {
      window.markdownEditor?.handleEnvelope({
        protocolVersion: 1,
        type: 'editor.setPageNavigatorDemand',
        requestId: null,
        payload,
      });
    } else {
      document.querySelector('#editor')?.dispatchEvent(new CustomEvent(
        'visual-page-navigator-demand-changed', { detail: payload },
      ));
    }
  }, { pageIndices: indices, transport });
}

async function loadAndDemand(
  page: Page, markdown: string, zoom: number, indices: number[], transport: 'bridge' | 'renderer',
): Promise<void> {
  const pageCount = await loadAndGetPageCount(page, markdown, zoom);
  if (pageCount <= Math.max(...indices)) {
    throw new Error(`Fixture has ${pageCount} pages; requested indices exceed it: ${indices.join(', ')}`);
  }
  await demandPages(page, indices, transport);
}

async function waitForRaster(page: Page, pageIndex: number) {
  await expect.poll(() => page.evaluate((index) => {
    const revision = Number(document.querySelector<HTMLElement>('#editor')?.dataset.pageLayoutRevision);
    return window.__thumbnailProbe.messages.some(({ type, payload }) => (
      type === 'editor.pageThumbnailChanged'
      && payload.pageIndex === index && payload.layoutRevision === revision
    ));
  }, pageIndex), { timeout: 20_000, message: `Current raster for page ${pageIndex + 1}` }).toBe(true);
  return page.evaluate(async (index) => {
    const payload = window.__thumbnailProbe.messages.filter(({ type, payload }) => (
      type === 'editor.pageThumbnailChanged' && payload.pageIndex === index
    )).at(-1)?.payload;
    if (typeof payload?.dataBase64 !== 'string') throw new Error('Missing raster');
    const image = new Image();
    image.src = `data:${String(payload.mimeType)};base64,${payload.dataBase64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing canvas context');
    context.drawImage(image, 0, 0);
    let darkPixels = 0;
    const luminance: number[] = [];
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.min(pixels[i] ?? 255, pixels[i + 1] ?? 255, pixels[i + 2] ?? 255) < 180) darkPixels++;
      luminance.push(((pixels[i] ?? 255) + (pixels[i + 1] ?? 255) + (pixels[i + 2] ?? 255)) / 3);
    }
    return { width: canvas.width, height: canvas.height, darkPixels, luminance, dataBase64: payload.dataBase64 };
  }, pageIndex);
}
