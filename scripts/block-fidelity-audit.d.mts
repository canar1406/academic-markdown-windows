export interface NormalizedRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BlockFidelityManifest {
  schemaVersion: 1;
  raster: { width: number; height: number; channelTolerance: number };
  blocks: Array<{
    id: string;
    visualPage: number;
    pdfPage: number;
    region: NormalizedRegion;
    comparison: 'raster' | 'structural';
    maxChangedFraction?: number;
  }>;
}

export interface BlockFidelityMeasurement {
  id: string;
  status: 'exact' | 'different' | 'structural-only';
  changedPixels?: number;
  totalPixels?: number;
  changedFraction?: number;
  meanChannelDelta?: number;
  maximumChannelDelta?: number;
  maxChangedFraction?: number;
  withinThreshold?: boolean;
}

export interface BlockFidelityResult {
  generatedAt: string;
  rasterWidth: number;
  rasterHeight: number;
  exactRasterMatches: number;
  rasterMeasurements: number;
  measurements: BlockFidelityMeasurement[];
}

export const REQUIRED_BLOCK_FIDELITY_IDS: readonly string[];
export function validateBlockFidelityManifest(
  manifest: unknown,
  options?: { requireComplete?: boolean },
): BlockFidelityManifest;
export function cropPpmImage(buffer: Buffer, region: NormalizedRegion): Buffer;
export function convertAsciiPpmToBinary(buffer: Buffer): Buffer;
export function auditBlockFidelity(options: {
  manifest: BlockFidelityManifest;
  visualPages: Map<number, Buffer> | Record<number, Buffer>;
  pdfPages: Map<number, Buffer> | Record<number, Buffer>;
  requireCompleteManifest?: boolean;
  generatedAt?: string;
}): BlockFidelityResult;
export function formatBlockFidelityMarkdown(result: BlockFidelityResult): string;
