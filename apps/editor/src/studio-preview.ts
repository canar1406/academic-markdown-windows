import {
  serializeLmxDirective,
  updateFrontMatter,
  replaceFrontMatterValue,
  validateQuickStyleAttributes,
  type LmxAttributeValue,
} from '@markdown/document-core';
import {
  compileAuthoredTheme,
  type ThemeSceneNode,
  type ThemeSceneV2,
} from '@markdown/theme-engine';

export interface StudioPreviewDiagnostic {
  message: string;
  severity: 'warning' | 'error';
}

export interface StudioPreviewResult {
  /** Empty on rejection: callers must keep the preceding snapshot intact. */
  markdown: string;
  diagnostics: StudioPreviewDiagnostic[];
}

type Attributes = Record<string, LmxAttributeValue>;
const containers = new Set(['page', 'stack', 'body']);
const theoremFamily = new Set(['theorem', 'property', 'proposition', 'corollary', 'lemma', 'exercise']);
const quickStyleKeys = new Set(['color', 'fontFamily', 'fontSizePt', 'fontWeight', 'fontStyle', 'lineHeight', 'align']);
const aliases: Record<string, string> = { accent: 'color', alignment: 'align' };

/** Disposable sample with the same portable snapshot and compiler as Apply.
 * Unsupported scenes are rejected, never approximated using an HCMUT fallback.
 * Literal content is sample data; the scene remains the reusable theme definition.
 */
export function projectThemeSceneToMarkdown(input: unknown, title = 'Theme Studio sample'): StudioPreviewResult {
  if (!withinBudget(input) || title.length > 4096) {
    return { markdown: '', diagnostics: [{ severity: 'error', message: 'Studio scene exceeds the JSON sample budget (depth 48, 8192 values, 256 KiB text), or is not JSON data.' }] };
  }
  const compiled = compileAuthoredTheme({
    schemaVersion: 1, id: 'studio-preview', version: '1.0.0', name: title.trim() || 'Theme Studio sample', scene: input,
  });
  if (!compiled.snapshot || !compiled.theme) {
    return { markdown: '', diagnostics: compiled.errors.map(message => ({ message, severity: 'error' })) };
  }
  const scene = compiled.snapshot.scene;
  const diagnostics: StudioPreviewDiagnostic[] = [{
    message: 'Independent authored theme sample: A4 flow and supported literal content/typography only. Compiled PDF remains the layout authority.',
    severity: 'warning',
  }];
  const warn = (message: string): void => { diagnostics.push({ message, severity: 'warning' }); };
  const render = (node: ThemeSceneNode, inherited: Attributes): string => {
    const text = (key: string, fallback = ''): string => typeof node.properties[key] === 'string' ? String(node.properties[key]) : fallback;
    // Match the compiler: typography inherits; alignment belongs to this node.
    const typography = Object.fromEntries(Object.entries(node.style).filter(([key]) => key !== 'background'));
    const style = { ...inherited, ...resolveStyle(typography, scene, warn) };
    const alignment = node.properties.alignment;
    const blockStyle = { ...style, ...resolveStyle(alignment === undefined ? {} : { alignment }, scene, warn) };
    const wrap = (content: string, component: string): string => content && Object.keys(blockStyle).length
      ? directive('style', content, { ...blockStyle, component }) : content;
    if (containers.has(node.widget)) {
      return node.children.map(child => render(child, style)).filter(Boolean).join('\n\n');
    }
    if (node.widget === 'cover') return node.properties.enabled === false ? '' : directive('cover', '');
    if (['section','row','column','text','image-placeholder'].includes(node.widget)) return directive('theme-layout', '', { node: node.id });
    if (['header', 'footer', 'page-number'].includes(node.widget)) return '';
    if (node.widget === 'paragraph') return wrap(escapeText(text('text', text('title', 'Đây là đoạn văn mẫu.'))), 'paragraph');
    if (node.widget === 'heading') {
      const level = Number(node.properties.level ?? 2);
      return wrap(`${'#'.repeat(level)} ${escapeText(text('text', text('title', 'Tiêu đề mẫu')))}`, `heading-${level}`);
    }
    if (theoremFamily.has(node.widget)) {
      const label = text('title');
      return wrap(directive(node.widget, escapeText(text('text', 'Nội dung định lý mẫu.')),
        label ? { title: singleLine(label) } : {}), node.widget);
    }
    // The compiler rejects unsupported widgets before this projection runs.
    return '';
  };
  const body = render(scene.root, {});
  const result = updateFrontMatter(`${body}\n`, { lmx: {
    schema: 1,
    structure: { cover: compiled.theme.manifest.capabilities.cover, toc: false, listOfFigures: false, listOfTables: false },
    cover: { title },
  } });
  // Exact replacement preserves empty scene objects/arrays, unlike metadata
  // patch serialization, which treats empty objects as merge containers.
  const snapshotResult = result.updated
    ? replaceFrontMatterValue(result.source, ['lmx', 'authoredTheme'], compiled.snapshot)
    : result;
  return { markdown: snapshotResult.updated ? snapshotResult.source : '', diagnostics: [...diagnostics, ...snapshotResult.diagnostics.map(({ message, severity }) => ({ message, severity }))] };
}

function resolveStyle(values: Record<string, unknown>, scene: ThemeSceneV2, warn: (message: string) => void): Attributes {
  const attributes: Attributes = {};
  for (const key of Object.keys(values).sort()) {
    const target = Object.hasOwn(aliases, key) ? aliases[key]! : key;
    if (!quickStyleKeys.has(target)) { warn(`Unsupported style property "${key}" was not projected.`); continue; }
    let value = values[key];
    if (isRecord(value) && typeof value.token === 'string') {
      const token: unknown = Object.hasOwn(scene.tokens, value.token) ? scene.tokens[value.token] : undefined;
      if (!isRecord(token)) { warn(`${key}: invalid style token.`); continue; }
      value = token.value;
      if (token.type === 'length') {
        const unit = target.endsWith('Mm') ? 'mm' : target.endsWith('Pt') ? 'pt' : undefined;
        if (!unit || typeof value !== 'number' || !['mm', 'pt'].includes(String(token.unit))) {
          warn(`${key}: incompatible length token.`); continue;
        }
        if (unit !== token.unit) value *= unit === 'pt' ? 72 / 25.4 : 25.4 / 72;
        value = Math.round(value * 10000) / 10000;
      } else if (!(token.type === 'color' && /color|background/i.test(target))
        && !(token.type === 'font-family' && /fontFamily$/i.test(target))) {
        warn(`${key}: incompatible token type.`); continue;
      }
    }
    if (target === 'align') value = value === 'leading' ? 'left' : value === 'trailing' ? 'right' : value;
    if (/fontWeight$/i.test(target) && typeof value === 'number') value = String(value);
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      warn(`${key}: invalid style value.`); continue;
    }
    const checked = validateQuickStyleAttributes({ [target]: value });
    if (checked.valid) Object.assign(attributes, checked.attributes);
    else checked.errors.forEach(warn);
  }
  return attributes;
}

function directive(name: string, content: string, attributes: Attributes = {}): string {
  return serializeLmxDirective({ kind: 'directive', name, content, attributes, children: [], startLine: 0, endLine: 0, raw: '' }).trimEnd();
}

// Flatten text-only properties to a single paragraph, escape all CommonMark
// punctuation (including ':' for LMX and '&' for entities), and never emit HTML.
function singleLine(value: string): string { return value.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim(); }
function escapeText(value: string): string { return singleLine(value).replace(/[!-/:-@\[-`{-~]/g, '\\$&'); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function withinBudget(input: unknown): boolean {
  const pending = [{ value: input, depth: 0 }];
  let count = 0;
  let characters = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++count > 8192 || entry.depth > 48) return false;
    const { value, depth } = entry;
    if (typeof value === 'string') characters += value.length;
    else if (typeof value === 'number') { if (!Number.isFinite(value)) return false; }
    else if (value !== null && typeof value === 'object') {
      // Foundation/WebKit may alias empty collections in structured arguments.
      // Repeated identity is not a cycle. Count each occurrence: real cycles
      // still exceed depth/value limits before reaching recursive validation.
      for (const [key, child] of Object.entries(value)) {
        characters += key.length;
        pending.push({ value: child, depth: depth + 1 });
        if (pending.length > 8192) return false;
      }
    } else if (value !== null && typeof value !== 'boolean') return false;
    if (characters > 256 * 1024) return false;
  }
  return true;
}
