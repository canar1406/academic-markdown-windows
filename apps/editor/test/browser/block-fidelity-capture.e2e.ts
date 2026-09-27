import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  auditBlockFidelity,
  convertAsciiPpmToBinary,
  formatBlockFidelityMarkdown,
  validateBlockFidelityManifest,
  type BlockFidelityManifest,
} from '../../../../scripts/block-fidelity-audit.mjs';
import { parsePdfInfo, summarizeTectonicLog } from '../../../../scripts/pdf-golden-lib.mjs';

const enabled = process.env.HCMUT_BLOCK_FIDELITY === '1';
const projectRoot = resolve(import.meta.dirname, '../../../..');
const fixturePath = join(projectRoot, 'tests/fixtures/hcmut/block-fidelity.md');
const manifestPath = join(projectRoot, 'tests/fixtures/hcmut/block-fidelity-manifest.json');
const figureSourcePath = join(projectRoot, 'apps/editor/test/fixtures/block-fidelity.svg');
const logoPath = join(projectRoot, 'themes/hcmut-report-v1/assets/hcmut.png');
const artifactRoot = join(projectRoot, 'output/pdf/block-fidelity-audit');

test.skip(!enabled, 'Set HCMUT_BLOCK_FIDELITY=1 to run the Tectonic/Poppler/Chromium raster audit.');

test('measures every Visual block against the corresponding TeX PDF crop', async ({ page }) => {
  test.setTimeout(180_000);
  const manifest = validateBlockFidelityManifest(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
  ) as BlockFidelityManifest;
  const source = readFileSync(fixturePath, 'utf8');
  const visualSource = source.replace(
    'apps/editor/test/fixtures/block-fidelity.png',
    'http://127.0.0.1:4189/block-fidelity.png',
  );
  const workspace = mkdtempSync(join(tmpdir(), 'hcmut-block-fidelity-'));
  const generatedFigure = join(workspace, 'block-fidelity.png');
  convertSvgToPng(figureSourcePath, generatedFigure);

  exportFixture(workspace);
  const exportedLatex = readFileSync(join(workspace, 'report.tex'), 'utf8');
  prepareCompileWorkspace(workspace, generatedFigure);
  const tools = resolveTools();
  const compile = spawnSync(tools.tectonic, [
    '--untrusted',
    '--keep-logs',
    '--outdir', workspace,
    join(workspace, 'report.tex'),
  ], { cwd: workspace, encoding: 'utf8' });
  const detailedLogPath = join(workspace, 'report.log');
  const compileLog = `${compile.stdout}${compile.stderr}\n${
    existsSync(detailedLogPath) ? readFileSync(detailedLogPath, 'utf8') : ''
  }`;
  expect(compile.status, compileLog).toBe(0);
  expect(summarizeTectonicLog(compileLog).missingCharacterCount, compileLog).toBe(0);

  const pdfPath = join(workspace, 'report.pdf');
  const pdfInfoResult = spawnSync(tools.pdfinfo, [pdfPath], { encoding: 'utf8' });
  expect(pdfInfoResult.status, pdfInfoResult.stderr).toBe(0);
  const pdfInfo = parsePdfInfo(pdfInfoResult.stdout);
  expect(pdfInfo.pageLabel).toBe('A4');
  expect(pdfInfo.pages).toBe(20);

  await installBridgeStub(page);
  await page.route('http://127.0.0.1:4189/block-fidelity.png', async (route) => {
    await route.fulfill({ path: generatedFigure, contentType: 'image/png' });
  });
  await page.setViewportSize({ width: 1100, height: 1320 });
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), visualSource);
  await expect(page.locator('[data-lmx-name="listing"]')).toHaveCount(1);
  await expect(page.locator('[data-lmx-name="figure"] img')).toHaveJSProperty('complete', true);
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  const visualMetrics = await waitForVisualPageStack(page, 20);
  expect(visualMetrics.width).toBe(manifest.raster.width);
  expect(Math.round(visualMetrics.pageHeight)).toBe(manifest.raster.height);
  const boundaryPages = await locatePageBreakBoundary(page, visualMetrics);
  expect(boundaryPages).toEqual({ before: 19, after: 20 });
  expect(exportedLatex.indexOf('ĐIỂM KIỂM TRA TRƯỚC NGẮT TRANG.')).toBeLessThan(
    exportedLatex.lastIndexOf('\\newpage'),
  );
  expect(exportedLatex.lastIndexOf('\\newpage')).toBeLessThan(
    exportedLatex.indexOf('ĐIỂM KIỂM TRA SAU NGẮT TRANG.'),
  );

  mkdirSync(join(artifactRoot, 'visual'), { recursive: true });
  mkdirSync(join(artifactRoot, 'pdf'), { recursive: true });
  const visualPages = new Map<number, Buffer>();
  const pdfPages = new Map<number, Buffer>();
  const visualPageNumbers = new Set(manifest.blocks.map((block) => block.visualPage));
  const pdfPageNumbers = new Set(manifest.blocks.map((block) => block.pdfPage));
  for (const pageNumber of [...visualPageNumbers].sort((a, b) => a - b)) {
    const ppm = await captureVisualPage(page, pageNumber, visualMetrics, workspace);
    visualPages.set(pageNumber, ppm);
    writeFileSync(join(artifactRoot, 'visual', `page-${pad(pageNumber)}.ppm`), ppm);
  }
  for (const pageNumber of [...pdfPageNumbers].sort((a, b) => a - b)) {
    const ppm = renderPdfPage(tools.pdftoppm, pdfPath, pageNumber, manifest, workspace);
    pdfPages.set(pageNumber, ppm);
    writeFileSync(join(artifactRoot, 'pdf', `page-${pad(pageNumber)}.ppm`), ppm);
  }

  const result = auditBlockFidelity({ manifest, visualPages, pdfPages });
  expect(result.measurements).toHaveLength(manifest.blocks.length);
  expect(result.measurements.find((measurement) => measurement.id === 'page-break')?.status)
    .toBe('structural-only');
  for (const measurement of result.measurements) {
    if (measurement.status === 'exact') expect(measurement.changedPixels).toBe(0);
    if (measurement.status !== 'structural-only') {
      if (measurement.changedFraction === undefined
        || measurement.maxChangedFraction === undefined
        || measurement.withinThreshold === undefined) {
        throw new Error(`${measurement.id} did not return a complete raster threshold result.`);
      }
      expect(
        measurement.withinThreshold,
        `${measurement.id} changed ${(measurement.changedFraction * 100).toFixed(4)}%; `
          + `approved ceiling ${(measurement.maxChangedFraction * 100).toFixed(4)}%`,
      ).toBe(true);
    }
  }
  writeFileSync(join(artifactRoot, 'report.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(join(artifactRoot, 'report.md'), `${formatBlockFidelityMarkdown(result)}\n## Capture notes\n\nThe standalone browser harness rewrites only the figure URL to its local test server because Muya resolves canonical relative image paths through the native Swift host in the packaged app. The PDF export still uses the canonical relative Markdown asset path.\n`, 'utf8');
});

interface VisualMetrics {
  width: number;
  pageHeight: number;
  pageGap: number;
  pageCount: number;
}

async function installBridgeStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'webkit', {
      configurable: true,
      value: { messageHandlers: { bridge: { postMessage(): void {} } } },
    });
  });
}

async function waitForVisualPageStack(page: Page, expectedPages: number): Promise<VisualMetrics> {
  const read = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render.');
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const width = editor.getBoundingClientRect().width;
    const pageCount = Math.max(1, Math.round((editor.getBoundingClientRect().height + pageGap) / (pageHeight + pageGap)));
    return { width, pageHeight, pageGap, pageCount };
  });
  await expect.poll(async () => (await read()).pageCount).toBe(expectedPages);
  return read();
}

async function locatePageBreakBoundary(page: Page, metrics: VisualMetrics) {
  return page.evaluate(({ pageHeight, pageGap }) => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render.');
    const editorTop = editor.getBoundingClientRect().top;
    const locate = (needle: string): number => {
      const block = [...editor.querySelectorAll<HTMLElement>('.mu-paragraph')]
        .find((candidate) => candidate.textContent?.includes(needle));
      if (!block) throw new Error(`Cannot locate page-break anchor: ${needle}`);
      const offset = block.getBoundingClientRect().top - editorTop;
      return Math.floor(offset / (pageHeight + pageGap)) + 1;
    };
    return {
      before: locate('ĐIỂM KIỂM TRA TRƯỚC NGẮT TRANG.'),
      after: locate('ĐIỂM KIỂM TRA SAU NGẮT TRANG.'),
    };
  }, metrics);
}

async function captureVisualPage(
  page: Page,
  pageNumber: number,
  metrics: VisualMetrics,
  workspace: string,
): Promise<Buffer> {
  const pageOffset = (pageNumber - 1) * (metrics.pageHeight + metrics.pageGap);
  await page.locator('.editor-stage').evaluate((stage, offset) => {
    if (!(stage instanceof HTMLElement)) throw new Error('Editor stage did not render.');
    stage.scrollTop = offset;
  }, pageOffset);
  const clip = await page.evaluate(({ offset, width, height }) => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render.');
    const rect = editor.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY + offset,
      width,
      height,
    };
  }, { offset: pageOffset, width: metrics.width, height: metrics.pageHeight });
  const pngPath = join(workspace, `visual-${pad(pageNumber)}.png`);
  await page.screenshot({ path: pngPath, clip, animations: 'disabled' });
  const asciiPath = join(workspace, `visual-${pad(pageNumber)}-ascii.ppm`);
  const conversion = spawnSync('/usr/bin/sips', ['-s', 'format', 'pbm', pngPath, '--out', asciiPath], {
    encoding: 'utf8',
  });
  if (conversion.status !== 0) throw new Error(conversion.stderr);
  return convertAsciiPpmToBinary(readFileSync(asciiPath));
}

function renderPdfPage(
  pdftoppm: string,
  pdfPath: string,
  pageNumber: number,
  manifest: BlockFidelityManifest,
  workspace: string,
): Buffer {
  const prefix = join(workspace, `pdf-${pad(pageNumber)}`);
  const rendered = spawnSync(pdftoppm, [
    '-f', String(pageNumber),
    '-l', String(pageNumber),
    '-singlefile',
    '-scale-to-x', String(manifest.raster.width),
    '-scale-to-y', String(manifest.raster.height),
    pdfPath,
    prefix,
  ], { encoding: 'utf8' });
  if (rendered.status !== 0) throw new Error(rendered.stderr);
  return readFileSync(`${prefix}.ppm`);
}

function prepareCompileWorkspace(workspace: string, figurePath: string): void {
  const logoTarget = join(workspace, 'Images/hcmut.png');
  mkdirSync(dirname(logoTarget), { recursive: true });
  copyFileSync(logoPath, logoTarget);
  const figureTarget = join(workspace, 'apps/editor/test/fixtures/block-fidelity.png');
  mkdirSync(dirname(figureTarget), { recursive: true });
  copyFileSync(figurePath, figureTarget);
}

function exportFixture(workspace: string): void {
  const result = spawnSync('/usr/bin/env', [
    'pnpm',
    '--filter', '@markdown/latex-exporter',
    'exec', 'vitest', 'run',
    'test/block-fidelity-fixture.test.ts',
    '-t', 'writes the deterministic TeX input',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, BLOCK_FIDELITY_EXPORT_DIR: workspace },
  });
  if (result.status !== 0) throw new Error(`${result.stdout}${result.stderr}`);
}

function convertSvgToPng(source: string, destination: string): void {
  const conversion = spawnSync('/usr/bin/sips', ['-s', 'format', 'png', source, '--out', destination], {
    encoding: 'utf8',
  });
  if (conversion.status !== 0) throw new Error(conversion.stderr);
}

function resolveTools() {
  return {
    tectonic: requiredTool(
      process.env.TECTONIC_BIN,
      join(projectRoot, 'output/tools/tectonic-0.17.0/tectonic'),
      'TECTONIC_BIN',
    ),
    pdfinfo: requiredTool(process.env.PDFINFO_BIN, findOnPath('pdfinfo'), 'PDFINFO_BIN'),
    pdftoppm: requiredTool(process.env.PDFTOPPM_BIN, findOnPath('pdftoppm'), 'PDFTOPPM_BIN'),
  };
}

function requiredTool(explicit: string | undefined, fallback: string, variable: string): string {
  const candidate = explicit ?? fallback;
  if (!candidate || !existsSync(candidate)) throw new Error(`Set ${variable} to an executable path.`);
  return candidate;
}

function findOnPath(name: string): string {
  const result = spawnSync('/usr/bin/env', ['which', name], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
