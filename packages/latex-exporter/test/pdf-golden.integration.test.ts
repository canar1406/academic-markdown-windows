import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { exportMarkdownToLatex } from '../src/index.js';
import {
  comparePpmImages,
  countDarkPixelsInRegion,
  parsePpm,
  parsePdfInfo,
  summarizeTectonicLog,
} from '../../../scripts/pdf-golden-lib.mjs';

const enabled = process.env.HCMUT_PDF_GOLDEN === '1';
const projectRoot = resolve(import.meta.dirname, '../../..');
const fixturePath = join(projectRoot, 'themes/hcmut-report-v1/fixtures/golden.md');
const referencePath = join(projectRoot, 'tests/fixtures/hcmut/hcmut-reference-golden.tex');
const logoPath = join(projectRoot, 'themes/hcmut-report-v1/assets/hcmut.png');

describe.runIf(enabled)('HCMUT compiled PDF golden', () => {
  it('compiles the compatible reference and app output as comparable A4 documents', () => {
    const tools = resolveTools();
    const workspace = mkdtempSync(join(tmpdir(), 'hcmut-pdf-golden-'));
    try {
      const referenceWorkspace = join(workspace, 'reference');
      const appWorkspace = join(workspace, 'app');
      mkdirSync(referenceWorkspace, { recursive: true });
      mkdirSync(appWorkspace, { recursive: true });
      copyLogo(referenceWorkspace);
      copyLogo(appWorkspace);

      const source = readFileSync(fixturePath, 'utf8');
      const exported = exportMarkdownToLatex(source, hcmutReportTheme);
      expect(exported.diagnostics).toEqual([]);
      const appTex = join(appWorkspace, 'report.tex');
      writeFileSync(appTex, exported.latex, 'utf8');
      const referenceTex = join(referenceWorkspace, 'report.tex');
      copyFileSync(referencePath, referenceTex);

      const reference = compilePdf(tools.tectonic, referenceWorkspace, referenceTex);
      const app = compilePdf(tools.tectonic, appWorkspace, appTex);
      expect(reference.status, reference.log).toBe(0);
      expect(app.status, app.log).toBe(0);
      expect(summarizeTectonicLog(reference.log).missingCharacterCount).toBe(0);
      const appLog = summarizeTectonicLog(app.log);
      expect(appLog.missingCharacterCount).toBe(0);
      expect(appLog.fontFallbackCount, app.log).toBe(0);

      const referenceInfo = inspectPdf(tools.pdfinfo, join(referenceWorkspace, 'report.pdf'));
      const appInfo = inspectPdf(tools.pdfinfo, join(appWorkspace, 'report.pdf'));
      expect(referenceInfo).toMatchObject({ pages: 5, pageLabel: 'A4' });
      expect(appInfo).toMatchObject({ pages: 5, pageLabel: 'A4' });
      expect(appInfo.widthPoints).toBeCloseTo(referenceInfo.widthPoints, 2);
      expect(appInfo.heightPoints).toBeCloseTo(referenceInfo.heightPoints, 2);

      const referenceCover = renderPage(tools.pdftoppm, referenceWorkspace, 1);
      const appCover = renderPage(tools.pdftoppm, appWorkspace, 1);
      const referenceBody = renderPage(tools.pdftoppm, referenceWorkspace, 5);
      const appBody = renderPage(tools.pdftoppm, appWorkspace, 5);
      const coverComparison = comparePpmImages(referenceCover, appCover, { channelTolerance: 12 });
      const bodyComparison = comparePages(tools.pdftoppm, referenceWorkspace, appWorkspace, 5);
      const bottomGuard = {
        left: 0.15,
        top: 0.935,
        right: 0.85,
        bottom: 0.945,
        channelThreshold: 80,
      };
      expect(countDarkPixelsInRegion(referenceCover, bottomGuard)).toBe(0);
      expect(countDarkPixelsInRegion(appCover, bottomGuard)).toBe(0);
      expect(app.log).not.toMatch(/Package geometry Warning: Over-specification/iu);
      expect(app.log).not.toMatch(/Font shape .* not available/iu);
      expect(app.log).not.toMatch(/Font shape .* tried instead/iu);
      for (const region of textWidthRuleEdgeRegions) {
        expect(countDarkPixelsInRegion(appBody, region)).toBeGreaterThan(0);
      }
      // Footer text/rule must remain visibly inside A4, with a white safety
      // band below it instead of being clipped by the page MediaBox.
      expect(countDarkPixelsInRegion(appBody, footerContentRegion)).toBeGreaterThan(20);
      expect(countDarkPixelsInRegion(appBody, footerSafetyBand)).toBe(0);
      for (const region of pageChromeRegions) {
        expect(countChangedPixelsInRegion(referenceBody, appBody, region)).toBe(0);
      }
      expect(coverComparison.changedFraction).toBeLessThan(0.12);
      expect(bodyComparison.changedFraction).toBeLessThan(0.08);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  it('compiles a maximum-length unbroken cover detail without overfull boxes', () => {
    const tools = resolveTools();
    const workspace = mkdtempSync(join(tmpdir(), 'hcmut-long-text-'));
    try {
      copyLogo(workspace);
      const latex = hcmutReportTheme.renderDocument('\\section{Nội dung}\nĐoạn văn.\n', {
        title: 'Đề tài',
        faculty: 'Khoa',
        reportType: 'Báo cáo',
        supervisor: 'S'.repeat(120),
        footerLeft: 'Footer',
        includeCover: true,
        includeToc: false,
        includeListOfFigures: false,
        includeListOfTables: false,
      });
      const texPath = join(workspace, 'report.tex');
      writeFileSync(texPath, latex, 'utf8');

      const compiled = compilePdf(tools.tectonic, workspace, texPath);
      expect(compiled.status, compiled.log).toBe(0);
      expect(compiled.log).not.toMatch(/Overfull \\hbox/u);
      expect(inspectPdf(tools.pdfinfo, join(workspace, 'report.pdf'))).toMatchObject({
        pages: 2,
        pageLabel: 'A4',
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  it('compiles an explicit break after a cover as one empty A4 sheet', () => {
    const tools = resolveTools();
    const workspace = mkdtempSync(join(tmpdir(), 'hcmut-cover-blank-page-'));
    try {
      copyLogo(workspace);
      const exported = exportMarkdownToLatex([
        ':::cover',
        ':::',
        '',
        ':::pagebreak',
        ':::',
        '',
        ':::cover',
        ':::',
        '',
      ].join('\n'), hcmutReportTheme);
      expect(exported.diagnostics).toEqual([]);
      const texPath = join(workspace, 'report.tex');
      writeFileSync(texPath, exported.latex, 'utf8');

      const compiled = compilePdf(tools.tectonic, workspace, texPath);
      expect(compiled.status, compiled.log).toBe(0);
      expect(inspectPdf(tools.pdfinfo, join(workspace, 'report.pdf'))).toMatchObject({
        pages: 3,
        pageLabel: 'A4',
      });
      const blankPage = renderPage(tools.pdftoppm, workspace, 2);
      expect(countDarkPixelsInRegion(blankPage, {
        left: 0,
        top: 0,
        right: 1,
        bottom: 1,
        channelThreshold: 245,
      })).toBe(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  it('compiles consecutive explicit page breaks as distinct empty A4 sheets', () => {
    const tools = resolveTools();
    const workspace = mkdtempSync(join(tmpdir(), 'hcmut-consecutive-blank-pages-'));
    try {
      copyLogo(workspace);
      const exported = exportMarkdownToLatex([
        '# Báo cáo Markdown',
        '',
        'Trường Đại học Bách khoa',
        '',
        ':::cover',
        ':::',
        '',
        ':::pagebreak',
        ':::',
        '',
        ':::cover',
        ':::',
        '',
        ':::pagebreak',
        ':::',
        '',
        ':::pagebreak',
        ':::',
        '',
        ':::cover',
        ':::',
        '',
      ].join('\n'), hcmutReportTheme);
      expect(exported.diagnostics).toEqual([]);
      const texPath = join(workspace, 'report.tex');
      writeFileSync(texPath, exported.latex, 'utf8');

      const compiled = compilePdf(tools.tectonic, workspace, texPath);
      expect(compiled.status, compiled.log).toBe(0);
      expect(inspectPdf(tools.pdfinfo, join(workspace, 'report.pdf'))).toMatchObject({
        pages: 7,
        pageLabel: 'A4',
      });
      for (const pageNumber of [3, 5, 6]) {
        const blankPage = renderPage(tools.pdftoppm, workspace, pageNumber);
        expect(countDarkPixelsInRegion(blankPage, {
          left: 0,
          top: 0,
          right: 1,
          bottom: 1,
          channelThreshold: 245,
        })).toBe(0);
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});

// fancyhdr rules are exactly the 160 mm text width between the 30 mm and
// 20 mm page margins, matching the supplied HCMUT reference PDF.
const textWidthRuleEdgeRegions = [
  { left: 0.14, top: 0.075, right: 0.17, bottom: 0.081, channelThreshold: 100 },
  { left: 0.88, top: 0.075, right: 0.91, bottom: 0.081, channelThreshold: 100 },
  { left: 0.14, top: 0.987, right: 0.17, bottom: 0.994, channelThreshold: 100 },
  { left: 0.88, top: 0.987, right: 0.91, bottom: 0.994, channelThreshold: 100 },
];

const pageChromeRegions = [
  { left: 0.10, top: 0.055, right: 0.94, bottom: 0.115 },
];

const footerContentRegion = {
  left: 0.10, top: 0.975, right: 0.94, bottom: 0.993, channelThreshold: 100,
};
const footerSafetyBand = {
  left: 0.10, top: 0.996, right: 0.94, bottom: 1, channelThreshold: 100,
};

function countChangedPixelsInRegion(
  referenceBuffer: Buffer,
  actualBuffer: Buffer,
  region: { left: number; top: number; right: number; bottom: number },
): number {
  const reference = parsePpm(referenceBuffer);
  const actual = parsePpm(actualBuffer);
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error('Pixel comparison requires matching raster dimensions.');
  }
  const left = Math.floor(region.left * reference.width);
  const top = Math.floor(region.top * reference.height);
  const right = Math.ceil(region.right * reference.width);
  const bottom = Math.ceil(region.bottom * reference.height);
  let changed = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * reference.width + x) * 3;
      if (
        reference.pixels[offset] !== actual.pixels[offset]
        || reference.pixels[offset + 1] !== actual.pixels[offset + 1]
        || reference.pixels[offset + 2] !== actual.pixels[offset + 2]
      ) {
        changed += 1;
      }
    }
  }
  return changed;
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
  if (!candidate || !existsSync(candidate)) {
    throw new Error(`Set ${variable} to an executable path.`);
  }
  return candidate;
}

function findOnPath(name: string): string {
  const result = spawnSync('/usr/bin/env', ['which', name], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function copyLogo(workspace: string): void {
  const images = join(workspace, 'Images');
  mkdirSync(images, { recursive: true });
  cpSync(logoPath, join(images, 'hcmut.png'));
}

function compilePdf(tectonic: string, workspace: string, texPath: string) {
  const result = spawnSync(tectonic, [
    '--untrusted',
    '--keep-logs',
    '--outdir', workspace,
    texPath,
  ], { cwd: workspace, encoding: 'utf8' });
  const detailedLogPath = join(workspace, 'report.log');
  const detailedLog = existsSync(detailedLogPath) ? readFileSync(detailedLogPath, 'utf8') : '';
  return {
    status: result.status,
    log: `${result.stdout}${result.stderr}\n${detailedLog}`,
  };
}

function inspectPdf(pdfinfo: string, pdfPath: string) {
  const result = spawnSync(pdfinfo, [pdfPath], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return parsePdfInfo(result.stdout);
}

function comparePages(
  pdftoppm: string,
  referenceWorkspace: string,
  appWorkspace: string,
  page: number,
) {
  const reference = renderPage(pdftoppm, referenceWorkspace, page);
  const app = renderPage(pdftoppm, appWorkspace, page);
  return comparePpmImages(reference, app, { channelTolerance: 12 });
}

function renderPage(pdftoppm: string, workspace: string, page: number): Buffer {
  const outputPrefix = join(workspace, `page-${page}`);
  const result = spawnSync(pdftoppm, [
    '-f', String(page),
    '-l', String(page),
    '-singlefile',
    '-r', '96',
    join(workspace, 'report.pdf'),
    outputPrefix,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return readFileSync(`${outputPrefix}.ppm`);
}
