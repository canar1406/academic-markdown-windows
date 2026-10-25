import { isMap, type Document, parseDocument } from 'yaml';

export {
  createDocumentIndex,
  type DocumentIndexSnapshot,
  type DocumentOutlineEntry,
  type DocumentResourceReference,
  type DocumentReferenceTarget,
  type DocumentSourceRange,
} from './document-index.js';
export {
  parseLmx,
  serializeLmxDirective,
  serializeLmxDocument,
  type LmxAttributeValue,
  type LmxDirectiveNode,
  type ParsedLmxDocument,
} from './lmx.js';
export {
  hasQuickStyleOverride,
  validateQuickStyleAttributes,
  type QuickStyleValidation,
} from './quick-style.js';
export {
  getLmxDefinition,
  getLmxInsertCommand,
  listLmxInsertCommands,
  listLmxDefinitions,
  type LmxAttributeDefinition,
  type LmxDefinition,
  type LmxInsertCommand,
} from './lmx-registry.js';
export {
  crossReferenceDisplayPrefix,
  extractCitedKeysFromMarkdown,
  formatAuthorInlineApa,
  formatAuthorsForBibliography,
  formatBibliographyItems,
  formatInlineCitationGroup,
  isCrossReferenceKey,
  normalizeCitationStyle,
  orderBibliographyEntries,
  parseBibtexEntries,
  parseReferencesBlockContent,
  readDocumentCitationStyle,
  readDocumentReferences,
  type CitationReferenceEntry,
  type CitationStyle,
  type FormattedBibliographyItem,
} from './citations.js';

export interface DocumentDiagnostic {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParsedFrontMatter {
  source: string;
  body: string;
  data: Record<string, unknown>;
  valid: boolean;
  diagnostics: DocumentDiagnostic[];
  hasFrontMatter: boolean;
}

export interface FrontMatterUpdate {
  source: string;
  updated: boolean;
  diagnostics: DocumentDiagnostic[];
}

export interface DocumentThemePackageReference {
  id: string;
  version: string;
  integrity?: string;
}

export interface DocumentThemeSelection {
  schemaVersion: 2;
  themes: Record<string, DocumentThemePackageReference>;
  theme: {
    default: string;
    components: Record<string, string>;
  };
}

export interface DocumentThemeSelectionParseResult {
  selection?: DocumentThemeSelection;
  valid: boolean;
  diagnostics: DocumentDiagnostic[];
}


interface FrontMatterSlice {
  yaml: string;
  body: string;
  lineBreak: '\n' | '\r\n';
  closingDelimiter: '---' | '...';
}

function parseFrontMatterDocument(yaml: string): Document.Parsed {
  return parseDocument(yaml, {
    keepSourceTokens: true,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });
}

export function parseFrontMatter(source: string): ParsedFrontMatter {
  const slice = splitFrontMatter(source);
  if (slice === null) {
    return {
      source,
      body: source,
      data: {},
      valid: true,
      diagnostics: [],
      hasFrontMatter: false,
    };
  }
  if ('diagnostic' in slice) {
    return {
      source,
      body: source,
      data: {},
      valid: false,
      diagnostics: [slice.diagnostic],
      hasFrontMatter: true,
    };
  }

  let document = parseFrontMatterDocument(slice.yaml);
  let compatibilityDiagnostics: DocumentDiagnostic[] = [];
  if (/^\s*\/\{/u.test(slice.yaml)) {
    const normalized = slice.yaml.replace(/^(\s*)\/\{/u, '$1{');
    const compatibilityDocument = parseFrontMatterDocument(normalized);
    // A slash-prefixed, incomplete flow map can parse as a different block
    // mapping. Never accept that accidental interpretation as user metadata.
    document = compatibilityDocument;
    if (compatibilityDocument.errors.length === 0
      && isRecord(compatibilityDocument.toJS())) {
      compatibilityDiagnostics = [{
        code: 'front-matter.legacy-flow-format',
        message: 'Legacy multiline flow front matter was read without changing the Markdown source.',
        severity: 'warning',
      }];
    }
  }
  if (document.errors.length > 0) {
    return {
      source,
      body: slice.body,
      data: {},
      valid: false,
      diagnostics: document.errors.map((error) => ({
        code: 'front-matter.invalid-yaml',
        message: error.message,
        severity: 'error',
      })),
      hasFrontMatter: true,
    };
  }

  const value: unknown = document.toJS();
  if (value !== null && !isRecord(value)) {
    return {
      source,
      body: slice.body,
      data: {},
      valid: false,
      diagnostics: [{
        code: 'front-matter.invalid-root',
        message: 'Front matter must contain a YAML mapping at its root.',
        severity: 'error',
      }],
      hasFrontMatter: true,
    };
  }

  return {
    source,
    body: slice.body,
    data: value ?? {},
    valid: true,
    diagnostics: [
      ...compatibilityDiagnostics,
      ...document.warnings.map((warning) => ({
        code: 'front-matter.yaml-warning',
        message: warning.message,
        severity: 'warning' as const,
      })),
    ],
    hasFrontMatter: true,
  };
}

export function updateFrontMatter(
  source: string,
  patch: Record<string, unknown>,
): FrontMatterUpdate {
  const parsed = parseFrontMatter(source);
  if (!parsed.valid) {
    return { source, updated: false, diagnostics: parsed.diagnostics };
  }
  const slice = splitFrontMatter(source);
  const lineBreak = slice && !('diagnostic' in slice) ? slice.lineBreak : detectLineBreak(source);
  const document = parseFrontMatterDocument(
    slice && !('diagnostic' in slice)
      ? slice.yaml.replace(/^(\s*)\/\{/u, '$1{')
      : '{}\n',
  );

  applyPatch(document, patch, []);
  const yaml = document.toString().trimEnd().replaceAll('\n', lineBreak);
  const body = slice && !('diagnostic' in slice) ? slice.body : source;
  const existing = slice && !('diagnostic' in slice) ? slice : null;
  const separator = !existing && body.length > 0 && !body.startsWith(lineBreak) ? lineBreak : '';
  const updatedSource = `---${lineBreak}${yaml}${lineBreak}${existing?.closingDelimiter ?? '---'}${lineBreak}${separator}${body}`;

  return { source: updatedSource, updated: true, diagnostics: [] };
}

/** Replace one metadata value atomically while preserving unrelated keys. */
export function replaceFrontMatterValue(
  source: string,
  path: readonly string[],
  value: unknown,
): FrontMatterUpdate {
  const parsed = parseFrontMatter(source);
  if (!parsed.valid || path.length === 0) {
    return { source, updated: false, diagnostics: parsed.diagnostics };
  }
  const slice = splitFrontMatter(source);
  const lineBreak = slice && !('diagnostic' in slice) ? slice.lineBreak : detectLineBreak(source);
  const document = parseFrontMatterDocument(
    slice && !('diagnostic' in slice) ? slice.yaml.replace(/^(\s*)\/\{/u, '$1{') : '{}\n',
  );
  for (let i = 1; i < path.length; i += 1) {
    const parent = document.getIn(path.slice(0, i), true);
    if (parent !== undefined && !isMap(parent)) {
      return { source, updated: false, diagnostics: [{
        code: 'frontmatter.invalid-parent', severity: 'error',
        message: `Cannot update ${path.join('.')}: its parent is not a metadata map.`,
      }] };
    }
  }
  document.setIn([...path], value);
  const yaml = document.toString().trimEnd().replaceAll('\n', lineBreak);
  const body = slice && !('diagnostic' in slice) ? slice.body : source;
  const existing = slice && !('diagnostic' in slice) ? slice : null;
  const separator = !existing && body.length > 0 && !body.startsWith(lineBreak) ? lineBreak : '';
  return {
    source: `---${lineBreak}${yaml}${lineBreak}${existing?.closingDelimiter ?? '---'}${lineBreak}${separator}${body}`,
    updated: true,
    diagnostics: [],
  };
}

export function parseDocumentThemeSelection(
  value: unknown,
): DocumentThemeSelectionParseResult {
  const diagnostics: DocumentDiagnostic[] = [];
  const lmx = isRecord(value) ? value : {};
  if (lmx.schema !== 2) {
    diagnostics.push(themeDiagnostic(
      'theme.unsupported-schema',
      'Theme selection requires lmx.schema: 2.',
    ));
    return { valid: false, diagnostics };
  }

  const rawThemes = isRecord(lmx.themes) ? lmx.themes : {};
  if (lmx.themes !== undefined && !isRecord(lmx.themes)) {
    diagnostics.push(themeDiagnostic(
      'theme.invalid-package-map',
      'Theme package aliases must be a mapping.',
    ));
  }
  const themes: Record<string, DocumentThemePackageReference> = {};
  for (const [alias, rawReference] of Object.entries(rawThemes)) {
    if (!isThemeSelectionKey(alias)) {
      diagnostics.push(themeDiagnostic('theme.invalid-alias', `Invalid theme alias: ${alias}.`));
      continue;
    }
    const reference = isRecord(rawReference) ? rawReference : {};
    const id = typeof reference.id === 'string' ? reference.id : '';
    const version = typeof reference.version === 'string' ? reference.version : '';
    const integrity = typeof reference.integrity === 'string' ? reference.integrity : undefined;
    if (!isStableThemeIdentifier(id)) {
      diagnostics.push(themeDiagnostic(
        'theme.invalid-package-id',
        `Theme package ID must be stable and path-free: ${alias}.`,
      ));
    }
    if (!isStableThemeVersion(version)) {
      diagnostics.push(themeDiagnostic(
        'theme.invalid-package-version',
        `Theme package version must be an exact path-free version: ${alias}.`,
      ));
    }
    if (reference.integrity !== undefined && !isThemeIntegrity(integrity)) {
      diagnostics.push(themeDiagnostic(
        'theme.invalid-package-integrity',
        `Theme package integrity must be sha256 followed by 64 hexadecimal digits: ${alias}.`,
      ));
    }
    themes[alias] = {
      id,
      version,
      ...(integrity === undefined ? {} : { integrity }),
    };
  }

  const rawTheme = isRecord(lmx.theme) ? lmx.theme : {};
  if (lmx.theme !== undefined && !isRecord(lmx.theme)) {
    diagnostics.push(themeDiagnostic(
      'theme.invalid-selection',
      'Theme selection must be a mapping.',
    ));
  }
  const defaultAlias = typeof rawTheme.default === 'string' ? rawTheme.default : '';
  const rawComponents = isRecord(rawTheme.components) ? rawTheme.components : {};
  if (rawTheme.components !== undefined && !isRecord(rawTheme.components)) {
    diagnostics.push(themeDiagnostic(
      'theme.invalid-component-selection',
      'Theme component selections must be a mapping.',
    ));
  }
  const components: Record<string, string> = {};
  if (!Object.prototype.hasOwnProperty.call(themes, defaultAlias)) {
    diagnostics.push(themeDiagnostic(
      'theme.undeclared-alias',
      `Default theme alias is not declared: ${defaultAlias || '(empty)'}.`,
    ));
  }
  for (const [slot, rawAlias] of Object.entries(rawComponents)) {
    if (!isThemeSelectionKey(slot) || typeof rawAlias !== 'string') {
      diagnostics.push(themeDiagnostic(
        'theme.invalid-component-selection',
        `Invalid component theme selection: ${slot}.`,
      ));
      continue;
    }
    components[slot] = rawAlias;
    if (!Object.prototype.hasOwnProperty.call(themes, rawAlias)) {
      diagnostics.push(themeDiagnostic(
        'theme.undeclared-alias',
        `Component theme alias is not declared: ${slot} -> ${rawAlias}.`,
      ));
    }
  }

  return {
    selection: {
      schemaVersion: 2,
      themes,
      theme: { default: defaultAlias, components },
    },
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

export function updateDocumentComponentTheme(
  source: string,
  componentSlot: string,
  themeAlias: string,
): FrontMatterUpdate {
  const parsed = parseFrontMatter(source);
  if (!parsed.valid) return { source, updated: false, diagnostics: parsed.diagnostics };
  const lmx = isRecord(parsed.data.lmx) ? parsed.data.lmx : undefined;
  const themeSelection = parseDocumentThemeSelection(lmx);
  if (!themeSelection.valid || !themeSelection.selection) {
    return { source, updated: false, diagnostics: themeSelection.diagnostics };
  }
  if (!isThemeSelectionKey(componentSlot)) {
    return {
      source,
      updated: false,
      diagnostics: [themeDiagnostic(
        'theme.invalid-component-selection',
        `Invalid component slot: ${componentSlot}.`,
      )],
    };
  }
  if (!Object.prototype.hasOwnProperty.call(themeSelection.selection.themes, themeAlias)) {
    return {
      source,
      updated: false,
      diagnostics: [themeDiagnostic(
        'theme.undeclared-alias',
        `Component theme alias is not declared: ${componentSlot} -> ${themeAlias}.`,
      )],
    };
  }
  return updateFrontMatter(source, {
    lmx: { theme: { components: { [componentSlot]: themeAlias } } },
  });
}

function themeDiagnostic(code: string, message: string): DocumentDiagnostic {
  return { code, message, severity: 'error' };
}

function isThemeSelectionKey(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function isStableThemeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isStableThemeVersion(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isThemeIntegrity(value: string | undefined): boolean {
  return value === undefined || /^sha256-[a-fA-F0-9]{64}$/.test(value);
}

function applyPatch(
  document: Document,
  patch: Record<string, unknown>,
  path: string[],
): void {
  for (const [key, value] of Object.entries(patch)) {
    const nextPath = [...path, key];
    if (isRecord(value)) {
      const current = document.getIn(nextPath, true);
      if (current !== undefined && !isMap(current)) {
        document.setIn(nextPath, value);
      } else {
        applyPatch(document, value, nextPath);
      }
    } else {
      document.setIn(nextPath, value);
    }
  }
}

function splitFrontMatter(
  source: string,
): FrontMatterSlice | { diagnostic: DocumentDiagnostic } | null {
  const lineBreak = detectLineBreak(source);
  const firstBreak = source.indexOf(lineBreak);
  const firstLine = firstBreak === -1 ? source : source.slice(0, firstBreak);
  if (firstLine !== '---') return null;
  if (firstBreak === -1) {
    return { diagnostic: unterminatedDiagnostic() };
  }

  let lineStart = firstBreak + lineBreak.length;
  while (lineStart <= source.length) {
    const nextBreak = source.indexOf(lineBreak, lineStart);
    const lineEnd = nextBreak === -1 ? source.length : nextBreak;
    const line = source.slice(lineStart, lineEnd);
    if (line === '---' || line === '...') {
      const bodyStart = nextBreak === -1 ? source.length : nextBreak + lineBreak.length;
      return {
        yaml: source.slice(firstBreak + lineBreak.length, lineStart),
        body: source.slice(bodyStart),
        lineBreak,
        closingDelimiter: line,
      };
    }
    if (nextBreak === -1) break;
    lineStart = nextBreak + lineBreak.length;
  }
  return { diagnostic: unterminatedDiagnostic() };
}

function detectLineBreak(source: string): '\n' | '\r\n' {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function unterminatedDiagnostic(): DocumentDiagnostic {
  return {
    code: 'front-matter.unterminated',
    message: 'Front matter starts with --- but has no closing delimiter.',
    severity: 'error',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
