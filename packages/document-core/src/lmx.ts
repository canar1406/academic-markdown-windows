import type { DocumentDiagnostic } from './index.js';

export type LmxAttributeValue = string | number | boolean;

export interface LmxDirectiveNode {
  kind: 'directive';
  name: string;
  identifier?: string;
  attributes: Record<string, LmxAttributeValue>;
  content: string;
  children: LmxDirectiveNode[];
  startLine: number;
  endLine: number;
  raw: string;
}

export interface ParsedLmxDocument {
  source: string;
  directives: LmxDirectiveNode[];
  diagnostics: DocumentDiagnostic[];
}

interface SourceLine {
  text: string;
  start: number;
  contentEnd: number;
  end: number;
}

interface DirectiveFrame {
  node: LmxDirectiveNode;
  openingEnd: number;
  children: LmxDirectiveNode[];
}

interface ParsedOpening {
  name: string;
  identifier?: string;
  attributes: Record<string, LmxAttributeValue>;
}

export function parseLmx(source: string): ParsedLmxDocument {
  const lines = splitSourceLines(source);
  const directives: LmxDirectiveNode[] = [];
  const diagnostics: DocumentDiagnostic[] = [];
  const stack: DirectiveFrame[] = [];
  let codeFence: { marker: '`' | '~'; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const fence = parseCodeFence(line.text);
    if (fence) {
      if (codeFence === null) {
        codeFence = fence;
      } else if (fence.marker === codeFence.marker && fence.length >= codeFence.length) {
        codeFence = null;
      }
      continue;
    }

    if (codeFence !== null) continue;

    if (/^\s*:::\s*$/.test(line.text)) {
      const frame = stack.pop();
      if (!frame) {
        diagnostics.push({
          code: 'lmx.unexpected-close',
          message: `Unexpected LMX closing fence on line ${index + 1}.`,
          severity: 'error',
        });
        continue;
      }

      frame.node.content = source.slice(frame.openingEnd, line.start);
      frame.node.children = frame.children;
      frame.node.endLine = index + 1;
      frame.node.raw = source.slice(lines[frame.node.startLine - 1]?.start ?? 0, line.end);

      const parent = stack.at(-1);
      if (parent) parent.children.push(frame.node);
      else directives.push(frame.node);
      continue;
    }

    if (!/^\s*:::[A-Za-z]/.test(line.text)) continue;

    const opening = parseDirectiveOpening(line.text);
    if ('diagnostic' in opening) {
      diagnostics.push({
        code: opening.diagnostic.code,
        message: `${opening.diagnostic.message} (line ${index + 1})`,
        severity: 'error',
      });
      continue;
    }

    stack.push({
      node: {
        kind: 'directive',
        name: opening.name,
        identifier: opening.identifier,
        attributes: opening.attributes,
        content: '',
        children: [],
        startLine: index + 1,
        endLine: 0,
        raw: '',
      },
      openingEnd: line.end,
      children: [],
    });
  }

  for (const frame of stack) {
    frame.node.content = source.slice(frame.openingEnd);
    frame.node.children = frame.children;
    frame.node.endLine = lines.length;
    frame.node.raw = source.slice(lines[frame.node.startLine - 1]?.start ?? 0);
    diagnostics.push({
      code: 'lmx.unterminated-directive',
      message: `LMX directive "${frame.node.name}" opened on line ${frame.node.startLine} has no closing fence.`,
      severity: 'error',
    });
  }

  return { source, directives, diagnostics };
}

export function serializeLmxDocument(document: ParsedLmxDocument): string {
  return document.source;
}

export function serializeLmxDirective(node: LmxDirectiveNode): string {
  const metadata: string[] = [];
  if (node.identifier) metadata.push(`#${node.identifier}`);

  for (const key of Object.keys(node.attributes).sort()) {
    const value = node.attributes[key];
    if (value === undefined) continue;
    metadata.push(`${key}=${serializeAttributeValue(value)}`);
  }

  const opening = metadata.length > 0
    ? `:::${node.name} {${metadata.join(' ')}}`
    : `:::${node.name}`;
  const content = node.content.length === 0 || node.content.endsWith('\n')
    ? node.content
    : `${node.content}\n`;
  return `${opening}\n${content}:::\n`;
}

function parseDirectiveOpening(
  line: string,
): ParsedOpening | { diagnostic: Pick<DocumentDiagnostic, 'code' | 'message'> } {
  const match = /^\s*:::([A-Za-z][A-Za-z0-9-]*)(?:\s+\{(.*)\})?\s*$/.exec(line);
  if (!match) {
    return {
      diagnostic: {
        code: 'lmx.invalid-opening',
        message: 'Invalid LMX directive opening fence.',
      },
    };
  }

  const name = match[1];
  if (!name) {
    return {
      diagnostic: {
        code: 'lmx.invalid-name',
        message: 'LMX directive name is required.',
      },
    };
  }

  const parsedAttributes = parseAttributes(match[2] ?? '');
  if ('diagnostic' in parsedAttributes) return parsedAttributes;
  return { name, ...parsedAttributes };
}

function parseAttributes(
  source: string,
): Pick<ParsedOpening, 'identifier' | 'attributes'> | {
  diagnostic: Pick<DocumentDiagnostic, 'code' | 'message'>;
} {
  const attributes: Record<string, LmxAttributeValue> = {};
  let identifier: string | undefined;
  let cursor = 0;

  while (cursor < source.length) {
    cursor = skipWhitespace(source, cursor);
    if (cursor >= source.length) break;

    if (source[cursor] === '#') {
      const identifierMatch = /^#([A-Za-z][A-Za-z0-9_.:-]*)/.exec(source.slice(cursor));
      if (!identifierMatch?.[1] || identifier !== undefined) return invalidAttributes();
      identifier = identifierMatch[1];
      cursor += identifierMatch[0].length;
      continue;
    }

    const keyMatch = /^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*/.exec(source.slice(cursor));
    if (!keyMatch?.[1]) return invalidAttributes();
    const key = keyMatch[1];
    cursor += keyMatch[0].length;
    const parsedValue = parseAttributeValue(source, cursor);
    if ('diagnostic' in parsedValue) return parsedValue;
    attributes[key] = parsedValue.value;
    cursor = parsedValue.cursor;
  }

  return { identifier, attributes };
}

function parseAttributeValue(
  source: string,
  cursor: number,
): { value: LmxAttributeValue; cursor: number } | {
  diagnostic: Pick<DocumentDiagnostic, 'code' | 'message'>;
} {
  if (source[cursor] === '"') {
    let value = '';
    for (let index = cursor + 1; index < source.length; index += 1) {
      const character = source[index];
      if (character === '"') return { value, cursor: index + 1 };
      if (character === '\\') {
        const escaped = source[index + 1];
        if (escaped === undefined) return invalidAttributes();
        value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
        index += 1;
      } else {
        value += character;
      }
    }
    return invalidAttributes();
  }

  const tokenMatch = /^[^\s]+/.exec(source.slice(cursor));
  const token = tokenMatch?.[0];
  if (!token) return invalidAttributes();
  const nextCursor = cursor + token.length;
  if (token === 'true') return { value: true, cursor: nextCursor };
  if (token === 'false') return { value: false, cursor: nextCursor };
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) {
    return { value: Number(token), cursor: nextCursor };
  }
  return { value: token, cursor: nextCursor };
}

function invalidAttributes(): {
  diagnostic: Pick<DocumentDiagnostic, 'code' | 'message'>;
} {
  return {
    diagnostic: {
      code: 'lmx.invalid-attributes',
      message: 'Invalid LMX directive attributes.',
    },
  };
}

function serializeAttributeValue(value: LmxAttributeValue): string {
  if (typeof value !== 'string') return String(value);
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;
}

function parseCodeFence(line: string): { marker: '`' | '~'; length: number } | null {
  const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  const markerText = match?.[1];
  if (!markerText) return null;
  return { marker: markerText[0] as '`' | '~', length: markerText.length };
}

function skipWhitespace(source: string, cursor: number): number {
  while (cursor < source.length && /\s/.test(source[cursor] ?? '')) cursor += 1;
  return cursor;
}

function splitSourceLines(source: string): SourceLine[] {
  if (source.length === 0) return [];
  const lines: SourceLine[] = [];
  let start = 0;
  while (start < source.length) {
    const nextBreak = source.indexOf('\n', start);
    const end = nextBreak === -1 ? source.length : nextBreak + 1;
    const contentEnd = nextBreak === -1
      ? source.length
      : nextBreak > start && source[nextBreak - 1] === '\r' ? nextBreak - 1 : nextBreak;
    lines.push({ text: source.slice(start, contentEnd), start, contentEnd, end });
    start = end;
  }
  return lines;
}
