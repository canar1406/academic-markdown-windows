export interface PpmImage {
  width: number;
  height: number;
  pixels: Buffer;
}

export interface PpmComparison {
  width: number;
  height: number;
  changedPixels: number;
  totalPixels: number;
  changedFraction: number;
  meanChannelDelta: number;
  maximumChannelDelta: number;
}

export interface PdfInfo {
  pages: number;
  widthPoints: number;
  heightPoints: number;
  pageLabel: string | null;
}

export interface TectonicLogSummary {
  errorCount: number;
  fontFallbackCount: number;
  warningCount: number;
  missingCharacterCount: number;
}

export function parsePpm(buffer: Buffer): PpmImage;
export function comparePpmImages(
  referenceBuffer: Buffer,
  actualBuffer: Buffer,
  options?: { channelTolerance?: number },
): PpmComparison;
export function countDarkPixelsInRegion(
  buffer: Buffer,
  region: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    channelThreshold?: number;
  },
): number;
export function parsePdfInfo(output: string): PdfInfo;
export function summarizeTectonicLog(log: string): TectonicLogSummary;
