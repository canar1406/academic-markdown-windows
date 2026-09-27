import type { DocumentDiagnostic } from './index.js';

export interface DocumentSourceRange {
  from: number;
  to: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export type DocumentReferenceTarget = 'external' | 'fragment' | 'relative-file' | 'invalid';

export interface DocumentOutlineEntry {
  id: string;
  parentId: string | null;
  level: number;
  title: string;
  sourceRange: DocumentSourceRange;
  pageIndex: number | null;
}

export interface DocumentResourceReference {
  id: string;
  kind: 'link' | 'image';
  text: string;
  destination: string;
  targetKind: DocumentReferenceTarget;
  sourceRange: DocumentSourceRange;
}

export interface DocumentIndexSnapshot {
  documentRevision: number;
  generation: number;
  outline: DocumentOutlineEntry[];
  links: DocumentResourceReference[];
  images: DocumentResourceReference[];
  diagnostics: DocumentDiagnostic[];
}

let nextGeneration = 0;

export function createDocumentIndex(source: string, documentRevision = 0): DocumentIndexSnapshot {
  const lines = source.split('\n');
  const outline: DocumentOutlineEntry[] = [];
  const links: DocumentResourceReference[] = [];
  const images: DocumentResourceReference[] = [];
  let offset = 0;
  let fenced = false;
  let fenceMarker = '';
  let linkIndex = 0;
  let imageIndex = 0;

  lines.forEach((line, lineIndex) => {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!fenced) {
        fenced = true;
        fenceMarker = fence[1]!.charAt(0);
      } else if (fence[1]!.charAt(0) === fenceMarker) {
        fenced = false;
        fenceMarker = '';
      }
      offset = lineEnd + 1;
      return;
    }
    if (!fenced) {
      if (!/^\s*(?:[-+*]|\d+[.)])\s+/.test(line) && !/^\s*>/.test(line)) {
        const heading = /^(\s*)(#{1,6})\s+(.+?)\s*$/.exec(line);
        if (heading) {
          const level = heading[2]!.length;
          const title = stripInlineMarkdown(heading[3]!);
          const parent = [...outline].reverse().find((item) => item.level < level);
          outline.push({
            id: `heading-${outline.length}`,
            parentId: parent?.id ?? null,
            level,
            title,
            sourceRange: makeRange(lineStart, lineEnd, lineIndex, 0, lineIndex, line.length),
            pageIndex: null,
          });
        }
      }
      scanReferences(line, lineStart, lineIndex, links, images, () => `link-${linkIndex++}`, () => `image-${imageIndex++}`);
    }
    offset = lineEnd + 1;
  });

  return {
    documentRevision,
    generation: ++nextGeneration,
    outline,
    links,
    images,
    diagnostics: [],
  };
}

function scanReferences(
  line: string,
  lineStart: number,
  lineIndex: number,
  links: DocumentResourceReference[],
  images: DocumentResourceReference[],
  nextLinkId: () => string,
  nextImageId: () => string,
): void {
  const pattern = /(!)?\[([^\]]*)\]\(([^\s)]+)(?:\s+[^)]*)?\)/g;
  for (const match of line.matchAll(pattern)) {
    const full = match[0];
    const isImage = match[1] === '!';
    const text = match[2] ?? '';
    const destination = match[3] ?? '';
    const from = lineStart + (match.index ?? 0);
    const to = from + full.length;
    const reference: DocumentResourceReference = {
      id: isImage ? nextImageId() : nextLinkId(),
      kind: isImage ? 'image' : 'link',
      text,
      destination,
      targetKind: classifyTarget(destination),
      sourceRange: makeRange(from, to, lineIndex, from - lineStart, lineIndex, to - lineStart),
    };
    (isImage ? images : links).push(reference);
  }
}

function classifyTarget(destination: string): DocumentReferenceTarget {
  if (/^https?:\/\//i.test(destination)) return 'external';
  if (destination.startsWith('#')) return 'fragment';
  if (/^[a-z][a-z\d+.-]*:/i.test(destination)) return 'invalid';
  return 'relative-file';
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/[`*_~]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
}

function makeRange(
  from: number,
  to: number,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): DocumentSourceRange {
  return { from, to, startLine: startLine + 1, startColumn: startColumn + 1, endLine: endLine + 1, endColumn: endColumn + 1 };
}
