import {
  parseDocumentThemeSelection,
  parseFrontMatter,
  parseLmx,
  validateQuickStyleAttributes,
  type DocumentDiagnostic,
  type DocumentThemeSelection,
  type LmxDirectiveNode,
  type QuickStyleValidation,
} from '@markdown/document-core';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import type { Content, PhrasingContent, Root, Table, TableCell } from 'mdast';
import {
  compileAuthoredTheme,
  escapeLatexText,
  latexPath,
  type LatexTheme,
  type ThemeDocumentSettings,
  type ThemeStructureBlock,
} from '@markdown/theme-engine';

export { escapeLatexText } from '@markdown/theme-engine';

export interface LatexExportResult {
  latex: string;
  diagnostics: DocumentDiagnostic[];
  settings: ThemeDocumentSettings;
  assetPaths: string[];
}

export interface RegisteredLatexTheme {
  theme: LatexTheme;
  integrity?: string;
}

export interface LatexThemeRegistry {
  themes: readonly (LatexTheme | RegisteredLatexTheme)[];
}

type QuickStyleAttributes = QuickStyleValidation['attributes'];
type QuickStyleFontStyle = NonNullable<QuickStyleAttributes['fontStyle']>;
type QuickStyleFontWeight = NonNullable<QuickStyleAttributes['fontWeight']>;

const defaultSettings: ThemeDocumentSettings = {
  title: 'Báo cáo Markdown',
  university: 'ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH',
  school: 'TRƯỜNG ĐẠI HỌC BÁCH KHOA',
  faculty: 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH',
  reportType: 'ĐỒ ÁN MÔN HỌC',
  coverHeading: 'BÁO CÁO',
  coverLogoEnabled: true,
  coverLogoWidthCm: 4,
  coverBorderEnabled: true,
  coverOuterBorderWidthPt: 4,
  coverInnerBorderWidthPt: 1.5,
  headerEnabled: true,
  headerInstitution: 'Trường Đại Học Bách Khoa - Đại học Quốc gia TP.HCM',
  headerFaculty: 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH',
  headerLogoEnabled: true,
  headerLogoSizeMm: 10,
  headerFontSizePt: 9,
  headerBold: true,
  headerRuleEnabled: true,
  headerRuleWidthPt: 0.3,
  footerEnabled: true,
  footerLeft: 'Báo cáo Đồ án chuyên ngành/Đồ án kỹ thuật máy tính/Đồ án môn học (CO4029/CO4041/...) - HK1 2023 - 2024',
  footerPageNumber: 'current-total',
  footerFontSizePt: 8,
  footerRuleEnabled: true,
  footerRuleWidthPt: 0.3,
  tocDepth: 3,
  includeCover: true,
  includeToc: true,
  includeListOfFigures: true,
  includeListOfTables: true,
};

export function exportMarkdownToLatex(
  source: string,
  fallbackTheme: LatexTheme,
  registry: LatexThemeRegistry = { themes: [] },
): LatexExportResult {
  const frontMatter = parseFrontMatter(source);
  const settings = readSettings(frontMatter.data);
  const lmx = parseLmx(frontMatter.body);
  const diagnostics = [...frontMatter.diagnostics, ...lmx.diagnostics];
  if (!frontMatter.valid || diagnostics.some((item) => item.severity === 'error')) {
    return { latex: '', diagnostics, settings, assetPaths: [] };
  }

  const lmxMetadata = recordValue(frontMatter.data.lmx);
  const authored = lmxMetadata.authoredTheme !== undefined
    ? compileAuthoredTheme(lmxMetadata.authoredTheme, frontMatter.data)
    : undefined;
  if (authored && !authored.theme) {
    diagnostics.push(...authored.errors.map(message => ({
      code: 'theme.authored-invalid', message, severity: 'error' as const,
    })));
    return { latex: '', diagnostics, settings, assetPaths: [] };
  }
  if (authored?.theme) {
    // Authored snapshots are independent. No HCMUT components or assets may
    // enter this export through a fallback or a stale legacy theme alias.
    fallbackTheme = authored.theme;
  }
  const themeSelection = authored ? undefined : readThemeSelection(frontMatter.data, diagnostics);
  const themes = registry.themes.map((entry) => (
    isRegisteredLatexTheme(entry) ? entry : { theme: entry }
  ));
  themes.push({ theme: fallbackTheme });
  const themeWarnings = new Set<string>();
  const warnOnce = (code: string, message: string, key: string): void => {
    if (themeWarnings.has(key)) return;
    themeWarnings.add(key);
    diagnostics.push({ code, message, severity: 'warning' });
  };
  const resolveAlias = (alias: string | undefined): LatexTheme => {
    if (!alias || !themeSelection) return fallbackTheme;
    const reference = themeSelection.themes[alias];
    if (!reference) {
      warnOnce(
        'theme.alias-undeclared',
        `Theme alias is not declared: ${alias}.`,
        `undeclared:${alias}`,
      );
      return fallbackTheme;
    }
    const registered = themes.find((entry) => (
      themeIdentity(entry.theme) === `${reference.id}@${reference.version}`
        && (reference.integrity === undefined || entry.integrity === reference.integrity)
    ));
    if (!registered) {
      const sameIdentity = themes.some((entry) => (
        themeIdentity(entry.theme) === `${reference.id}@${reference.version}`
      ));
      const code = sameIdentity ? 'theme.integrity-mismatch' : 'theme.package-unavailable';
      const message = sameIdentity
        ? `Theme package integrity does not match: ${reference.id}@${reference.version} (alias ${alias}).`
        : `Theme package is unavailable: ${reference.id}@${reference.version} (alias ${alias}).`;
      warnOnce(
        code,
        message,
        `${code}:${alias}:${reference.id}@${reference.version}`,
      );
      return fallbackTheme;
    }
    return registered.theme;
  };
  const documentTheme = resolveAlias(themeSelection?.theme.default);
  const assets = new Set<string>();
  const explicitStructureDirectives = lmx.directives.filter((node) => (
    isStructureBlock(node.name)
  ));
  settings.explicitStructureBlocks = explicitStructureDirectives.map((node) => (
    node.name as ThemeStructureBlock
  ));
  const collectLayoutIds = (nodes: LmxDirectiveNode[]): string[] => nodes.flatMap(node => [
    ...(node.name === 'theme-layout' && typeof node.attributes.node === 'string' ? [node.attributes.node] : []),
    ...collectLayoutIds(node.children),
  ]);
  settings.explicitThemeLayoutNodes = [...new Set(collectLayoutIds(lmx.directives))];
  const context: RenderContext = {
    theme: documentTheme,
    fallbackTheme,
    themeSelection,
    resolveAlias,
    settings,
    lastExplicitStructure: explicitStructureDirectives.at(-1),
  };
  const body = renderSourceWithDirectives(
    frontMatter.body,
    lmx.directives,
    diagnostics,
    assets,
    context,
  );
  if (diagnostics.some((item) => item.severity === 'error')) {
    return { latex: '', diagnostics, settings, assetPaths: [...assets].sort() };
  }
  return {
    latex: documentTheme.renderDocument(body, settings),
    diagnostics,
    settings,
    assetPaths: [...assets].sort(),
  };
}

function renderSourceWithDirectives(
  source: string,
  directives: LmxDirectiveNode[],
  diagnostics: DocumentDiagnostic[],
  assets: Set<string>,
  context: RenderContext,
): string {
  let cursor = 0;
  let output = '';
  let previousDirective: LmxDirectiveNode | undefined;
  for (const directive of directives) {
    const start = source.indexOf(directive.raw, cursor);
    if (start === -1) continue;
    const markdownBefore = source.slice(cursor, start);
    output += renderMarkdown(markdownBefore, assets, diagnostics, context);
    const emptyBeforeDirective = markdownBefore.trim().length === 0;
    output += renderDirective(directive, diagnostics, assets, context, {
      // A page break advances to the next page. At the document start or after
      // another break it closes an empty page; after a full-page structure the
      // cursor is already at the requested boundary, so it is a no-op.
      forceBlankPage: directive.name === 'pagebreak'
        && emptyBeforeDirective
        && (previousDirective === undefined || previousDirective.name === 'pagebreak'),
      suppressPageBreak: directive.name === 'pagebreak'
        && emptyBeforeDirective
        && previousDirective !== undefined
        && rendersFullPageDirective(previousDirective, context.settings),
    });
    cursor = start + directive.raw.length;
    previousDirective = directive;
  }
  output += renderMarkdown(source.slice(cursor), assets, diagnostics, context);
  return output;
}

function renderDirective(
  node: LmxDirectiveNode,
  diagnostics: DocumentDiagnostic[],
  assets: Set<string>,
  context: RenderContext,
  options: { forceBlankPage?: boolean; suppressPageBreak?: boolean } = {},
): string {
  const title = stringAttribute(node, 'title');
  const instanceThemeAlias = stringAttribute(node, 'theme') ?? context.instanceThemeAlias;
  const directiveContext = {
    ...context,
    instanceThemeAlias,
    // Floats, styled boxes and theorem-like containers cannot contain a
    // page-breaking longtable. Front sections remain normal document flow.
    boxedTable: context.boxedTable || !['front-section', 'pagebreak'].includes(node.name),
  };
  const quickStyle = validatedQuickStyleAttributes(node, diagnostics);
  const applyQuickStyle = (rendered: string): string => renderQuickStyle(
    rendered,
    quickStyle,
    node,
    diagnostics,
  );
  const label = node.identifier ? `\\label{${sanitizeLabel(node.identifier)}}\n` : '';
  const renderBody = () => renderSourceWithDirectives(
    node.content,
    node.children,
    diagnostics,
    assets,
    directiveContext,
  ).trim();
  const theoremEnvironment: Record<string, string> = {
    theorem: 'theorem',
    property: 'property',
    proposition: 'proposition',
    corollary: 'corollary',
    lemma: 'lemma',
    exercise: 'exer',
  };

  const environment = theoremEnvironment[node.name];
  if (environment) {
    const formattedTitle = title
      ? formatQuickStyleTitle(title, quickStyle, diagnostics, node)
      : '';
    const option = formattedTitle ? `[${formattedTitle}]` : '';
    const body = renderBody();
    return applyQuickStyle(renderComponent(directiveContext, node.name, {
      title: formattedTitle,
      option,
      label,
      body,
    }, () => `\\begin{${environment}}${option}\n${label}${body}\n\\end{${environment}}\n\n`));
  }

  switch (node.name) {
    case 'theme-layout': {
      const nodeId = node.attributes.node;
      const valid = typeof nodeId === 'string' && nodeId.length > 0
        && Object.keys(node.attributes).length === 1 && !node.identifier && !node.content.trim();
      const rendered = valid ? directiveContext.theme.renderThemeLayout?.(nodeId) : undefined;
      if (rendered === undefined) {
        diagnostics.push({
          code: 'theme.invalid-layout-marker',
          message: `Invalid theme-layout marker on line ${node.startLine}: expected an empty marker with a known authored section node ID.`,
          severity: 'error',
        });
        return '';
      }
      return rendered;
    }
    case 'style': {
      const body = renderBody();
      return renderQuickStyle(body, quickStyle, node, diagnostics);
    }
    case 'cover':
    case 'toc':
    case 'list-of-figures':
    case 'list-of-tables': {
      warnUnrenderedQuickStyle(quickStyle, node, diagnostics);
      const structureBlock = node.name as ThemeStructureBlock;
      const structureTheme = resolveThemeForSlot(directiveContext, structureBlock);
      const renderer = structureTheme.renderStructureBlock
        ?? directiveContext.fallbackTheme.renderStructureBlock;
      if (!renderer) {
        diagnostics.push({
          code: 'theme.unsupported-structure-placement',
          message: `Theme does not support placement block: ${structureBlock}.`,
          severity: 'error',
        });
        return '';
      }
      const rendered = renderer(structureBlock, directiveContext.settings);
      const bodyStart = node === directiveContext.lastExplicitStructure
        ? directiveContext.theme.renderBodyStart?.(directiveContext.settings) ?? ''
        : '';
      return `${rendered}${bodyStart}`;
    }
    case 'pagebreak': {
      warnUnrenderedQuickStyle(quickStyle, node, diagnostics);
      if (options.suppressPageBreak) return '';
      const pageFill = options.forceBlankPage ? '\\thispagestyle{empty}\n\\null\n' : '';
      return `${pageFill}${renderComponent(directiveContext, 'page-break', {}, () => '\\newpage\n\n')}`;
    }
    case 'figure':
      return applyQuickStyle(renderFigure(node, assets, diagnostics, directiveContext));
    case 'table':
      return applyQuickStyle(renderTableDirective(node, assets, diagnostics, directiveContext));
    case 'listing':
      return applyQuickStyle(renderListing(node, diagnostics, directiveContext));
    case 'front-section': {
      const sectionTitle = title ?? frontSectionTitle(stringAttribute(node, 'kind'));
      const numbered = node.attributes.numbered === true;
      const pageStyle = frontSectionPageStyle(stringAttribute(node, 'pageStyle'));
      const body = renderBody();
      return applyQuickStyle(renderComponent(directiveContext, 'front-section', {
        numbered: numbered ? 'true' : '',
        unnumbered: numbered ? '' : 'true',
        titleArgument: `{${escapeLatexText(sectionTitle)}}`,
        pageStyleArgument: `{${pageStyle}}`,
        body,
      }, () => `${numbered ? '\\section' : '\\section*'}{${escapeLatexText(sectionTitle)}}\n\\thispagestyle{${pageStyle}}\n${body}\n\\clearpage\n\\pagenumbering{arabic}\n\n`));
    }
    default:
      diagnostics.push({
        code: 'lmx.unsupported-directive',
        message: `Unsupported LMX directive: ${node.name}.`,
        severity: 'error',
      });
      return '';
  }
}

function frontSectionPageStyle(value: string | undefined): 'empty' | 'plain' {
  return value === 'plain' ? 'plain' : 'empty';
}

interface RenderContext {
  boxedTable?: boolean;
  theme: LatexTheme;
  fallbackTheme: LatexTheme;
  themeSelection?: DocumentThemeSelection;
  resolveAlias(alias: string | undefined): LatexTheme;
  instanceThemeAlias?: string;
  settings: ThemeDocumentSettings;
  lastExplicitStructure?: LmxDirectiveNode;
}

function isStructureBlock(name: string): name is ThemeStructureBlock {
  return name === 'cover'
    || name === 'toc'
    || name === 'list-of-figures'
    || name === 'list-of-tables';
}

function rendersFullPageDirective(
  node: LmxDirectiveNode,
  settings: ThemeDocumentSettings,
): boolean {
  switch (node.name) {
    case 'cover': return settings.includeCover;
    case 'toc': return settings.includeToc;
    case 'list-of-figures': return settings.includeListOfFigures;
    case 'list-of-tables': return settings.includeListOfTables;
    case 'front-section': return true;
    default: return false;
  }
}

function renderFigure(
  node: LmxDirectiveNode,
  assets: Set<string>,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  const content = node.content.trim();
  const root = fromMarkdown(content);
  const block = root.children.length === 1 ? root.children[0] : undefined;
  const image = block?.type === 'paragraph' && block.children.length === 1
    ? block.children[0]
    : undefined;
  const match = image?.type === 'image'
    ? { alt: image.alt ?? '', path: image.url }
    : parseSingleImageHtml(content);
  if (!match?.path) {
    diagnostics.push({
      code: 'lmx.invalid-figure',
      message: `Figure on line ${node.startLine} must contain one Markdown image or supported Muya img tag with a safe local path.`,
      severity: 'error',
    });
    return '';
  }
  const path = match.path;
  const renderedPath = renderLatexAssetPath(path, diagnostics, node.startLine);
  if (!renderedPath) return '';
  assets.add(path);
  const caption = stringAttribute(node, 'caption') ?? match.alt ?? '';
  const width = numericAttribute(node, 'width') ?? 0.8;
  const placement = safePlacement(stringAttribute(node, 'placement'));
  const label = node.identifier ? `\\label{${sanitizeLabel(node.identifier)}}\n` : '';
  const values = {
    placement,
    width: String(width),
    path: renderedPath,
    caption: escapeLatexText(caption),
    label,
  };
  return renderComponent(context, 'figure', values, () => `\\begin{figure}[${placement}]\n\\centering\n\\includegraphics[width=${width}\\textwidth]{${renderedPath}}\n\\caption{${escapeLatexText(caption)}}\n${label}\\end{figure}\n\n`);
}

function parseSingleImageHtml(content: string): { alt: string; path: string } | undefined {
  // This is a deliberately restricted quoted-attribute grammar, not general
  // HTML. Muya's DOMParser is browser-only; no DOM/runtime dependency belongs
  // in the shared exporter. Reject unsupported attributes instead of silently
  // discarding behavior (especially data-src, srcset, style and event handlers).
  const tag = /^\s*<img\b([\s\S]*?)\/?>\s*$/iu.exec(content);
  if (!tag) return undefined;

  const attributes = new Map<string, string>();
  const source = tag[1] ?? '';
  let offset = 0;
  while (offset < source.length) {
    const whitespace = /^[ \t\r\n\f]*/u.exec(source.slice(offset))?.[0].length ?? 0;
    offset += whitespace;
    if (offset >= source.length) break;
    if (whitespace === 0) return undefined;
    const name = /^[A-Za-z_:][A-Za-z0-9:._-]*/u.exec(source.slice(offset));
    if (!name) return undefined;
    offset += name[0].length;
    offset += /^[ \t\r\n\f]*/u.exec(source.slice(offset))?.[0].length ?? 0;
    if (source[offset] !== '=') return undefined;
    offset += 1;
    offset += /^[ \t\r\n\f]*/u.exec(source.slice(offset))?.[0].length ?? 0;
    const quote = source[offset];
    if (quote !== '"' && quote !== "'") return undefined;
    offset += 1;
    const end = source.indexOf(quote, offset);
    if (end < 0) return undefined;
    const value = decodeHtmlAttribute(source.slice(offset, end));
    offset = end + 1;
    const key = name[0].toLowerCase();
    if (!['src', 'alt', 'title', 'data-align'].includes(key) || attributes.has(key)) return undefined;
    attributes.set(key, value);
  }

  const path = attributes.get('src');
  if (!path) return undefined;
  return { alt: attributes.get('alt') ?? '', path };
}

function decodeHtmlAttribute(value: string): string {
  // Reuse the installed CommonMark entity decoder on individual references:
  // the rest of an HTML attribute must NOT undergo Markdown escape parsing.
  // String.replace visits only the original references, so decoding is once.
  return value.replace(/&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/gu, (entity) => {
    const paragraph = fromMarkdown(entity).children[0];
    const text = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;
    return text?.type === 'text' ? text.value : entity;
  });
}

function renderTableDirective(
  node: LmxDirectiveNode,
  assets: Set<string>,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  const caption = escapeLatexText(stringAttribute(node, 'caption') ?? '');
  const placement = safePlacement(stringAttribute(node, 'placement'));
  const label = node.identifier ? `\\label{${sanitizeLabel(node.identifier)}}\n` : '';
  const body = renderMarkdown(node.content, assets, diagnostics, { ...context, boxedTable: true }).trim();
  return renderComponent(context, 'table', { placement, body, caption, label }, () => `\\begin{table}[${placement}]\n\\centering\n${body}\n\\caption{${caption}}\n${label}\\end{table}\n\n`);
}

function renderListing(
  node: LmxDirectiveNode,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  const match = /^\s*```[^\n]*\n([\s\S]*?)\n```\s*$/.exec(node.content);
  const content = match?.[1] ?? node.content.trimEnd();
  if (!validateListingContent(content, diagnostics, node.startLine)) return '';
  const language = listingLanguageOption(
    stringAttribute(node, 'language'),
    diagnostics,
    node.startLine,
  );
  const caption = stringAttribute(node, 'caption');
  const label = node.identifier ? sanitizeLabel(node.identifier) : undefined;
  const numbers = node.attributes.lineNumbers === false ? 'none' : 'left';
  const options = [
    language,
    `numbers=${numbers}`,
    caption ? `caption={${escapeLatexText(caption)}}` : '',
    label ? `label={${label}}` : '',
  ].filter(Boolean).join(',');
  return renderComponent(context, 'listing', { options, body: content }, () => `\\begin{lstlisting}[${options}]\n${content}\n\\end{lstlisting}\n\n`);
}

function renderMarkdown(
  source: string,
  assets: Set<string>,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  if (source.trim().length === 0) return source.includes('\n') ? '\n' : '';
  const root = fromMarkdown(source, {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  });
  return renderChildren(root, assets, diagnostics, context);
}

function renderChildren(
  parent: Root | Content,
  assets: Set<string>,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  if (!('children' in parent)) return '';
  return parent.children.map((child) => renderNode(
    child as Content,
    assets,
    diagnostics,
    context,
  )).join('');
}

function renderNode(
  node: Content,
  assets: Set<string>,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  switch (node.type) {
    case 'heading': {
      const commands = ['section', 'subsection', 'subsubsection', 'subsubsubsection'];
      const command = commands[Math.min(node.depth, 4) - 1] ?? 'subsubsubsection';
      const title = renderInline(node.children, assets, diagnostics, context);
      return renderComponent(context, `heading-${Math.min(node.depth, 4)}`, { title }, () => `\\${command}{${title}}\n`);
    }
    case 'paragraph':
      return `${renderInline(node.children, assets, diagnostics, context)}\n\n`;
    case 'blockquote':
      return `\\begin{quote}\n${renderChildren(node, assets, diagnostics, { ...context, boxedTable: true }).trim()}\n\\end{quote}\n\n`;
    case 'list': {
      const environment = node.ordered ? 'enumerate' : 'itemize';
      return `\\begin{${environment}}\n${renderChildren(node, assets, diagnostics, { ...context, boxedTable: true })}\\end{${environment}}\n\n`;
    }
    case 'listItem': {
      const taskMarker = node.checked === true
        ? '[$\\boxtimes$]'
        : node.checked === false
          ? '[$\\square$]'
          : '';
      return `\\item${taskMarker} ${renderChildren(node, assets, diagnostics, context).trim()}\n`;
    }
    case 'code': {
      const line = node.position?.start.line;
      if (!validateListingContent(node.value, diagnostics, line)) return '';
      const options = listingLanguageOption(node.lang, diagnostics, line);
      return renderComponent(context, 'listing', { options, body: node.value }, () => `\\begin{lstlisting}[${options}]\n${node.value}\n\\end{lstlisting}\n\n`);
    }
    case 'math':
      return `\\[\n${node.value}\n\\]\n\n`;
    case 'thematicBreak':
      return '\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par\n';
    case 'table':
      return renderTable(node, assets, diagnostics, context);
    case 'html':
      return `${escapeLatexText(node.value)}\n`;
    default:
      return 'children' in node ? renderChildren(node, assets, diagnostics, context) : '';
  }
}

function renderInline(
  nodes: PhrasingContent[],
  assets: Set<string>,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return escapeLatexText(node.value);
      case 'strong': return `\\textbf{${renderInline(node.children, assets, diagnostics, context)}}`;
      case 'emphasis': return `\\emph{${renderInline(node.children, assets, diagnostics, context)}}`;
      case 'delete': return `\\sout{${renderInline(node.children, assets, diagnostics, context)}}`;
      case 'inlineCode': return `\\texttt{${escapeLatexText(node.value)}}`;
      case 'inlineMath': return `$${node.value}$`;
      case 'break': return '\\\\\n';
      case 'link': return `\\href{${latexPath(node.url)}}{${renderInline(node.children, assets, diagnostics, context)}}`;
      case 'image': {
        const renderedPath = renderLatexAssetPath(node.url, diagnostics, node.position?.start.line);
        if (!renderedPath) return escapeLatexText(node.alt ?? '');
        assets.add(node.url);
        return `\\includegraphics{${renderedPath}}`;
      }
      default: return 'children' in node
        ? renderInline(node.children as PhrasingContent[], assets, diagnostics, context)
        : '';
    }
  }).join('');
}

function renderTable(
  table: Table,
  assets: Set<string>,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  const columnCount = table.children[0]?.children.length ?? 1;
  const rows = table.children.map((row) => {
    const cells = Array.from({ length: columnCount }, (_, index) => {
      const cell = row.children[index];
      return cell ? renderTableCell(cell, assets, diagnostics, context) : '';
    }).join(' & ');
    return `${cells} \\\\`;
  });
  const columnSpec = Array.from({ length: columnCount }, (_, index) => {
    const alignment = table.align?.[index];
    const command = alignment === 'center' ? '\\centering'
      : alignment === 'right' ? '\\raggedleft' : '\\raggedright';
    const column = context.boxedTable ? 'X'
      : `p{\\dimexpr(\\linewidth-${2 * columnCount}\\tabcolsep)/${columnCount}\\relax}`;
    return `>{${command}\\arraybackslash}${column}`;
  }).join('');
  const header = `\\toprule\n${rows[0] ?? ''}\n\\midrule`;
  const body = rows.slice(1).join('\n');
  if (context.boxedTable) {
    return `\\begin{tabularx}{\\linewidth}{${columnSpec}}\n${header}\n${body}\n\\bottomrule\n\\end{tabularx}\n`;
  }
  // Native-size text wraps within the available line width, rather than
  // shrinking an unbounded tabular. Header rows repeat if the table continues.
  return `\\begingroup\n\\setlength{\\LTleft}{0pt}\n\\setlength{\\LTright}{0pt}\n\\begin{longtable}{${columnSpec}}\n${header}\n\\endfirsthead\n${header}\n\\endhead\n\\bottomrule\n\\endfoot\n${body}\n\\end{longtable}\n\\endgroup\n`;
}

function renderTableCell(
  cell: TableCell,
  assets: Set<string>,
  diagnostics: DocumentDiagnostic[],
  context: RenderContext,
): string {
  return cell.children.map((child) => renderInline([child], assets, diagnostics, context)).join('');
}

function renderComponent(
  context: RenderContext,
  slot: string,
  values: Readonly<Record<string, string>>,
  fallback: () => string,
): string {
  const selectedTheme = resolveThemeForSlot(context, slot);
  return selectedTheme.renderComponent?.(slot, values)
    ?? context.fallbackTheme.renderComponent?.(slot, values)
    ?? fallback();
}

function resolveThemeForSlot(context: RenderContext, slot: string): LatexTheme {
  const alias = context.instanceThemeAlias
    ?? context.themeSelection?.theme.components[slot];
  return alias ? context.resolveAlias(alias) : context.theme;
}

function readThemeSelection(
  data: Record<string, unknown>,
  diagnostics: DocumentDiagnostic[],
): DocumentThemeSelection | undefined {
  const lmx = recordValue(data.lmx);
  if (lmx.schema === undefined || lmx.schema === 1) return undefined;
  const parsed = parseDocumentThemeSelection(lmx);
  diagnostics.push(...parsed.diagnostics);
  return parsed.valid ? parsed.selection : undefined;
}

function themeIdentity(theme: LatexTheme): string {
  return `${theme.manifest.id}@${theme.manifest.version}`;
}

function isRegisteredLatexTheme(
  value: LatexTheme | RegisteredLatexTheme,
): value is RegisteredLatexTheme {
  return 'theme' in value;
}

function validatedQuickStyleAttributes(
  node: LmxDirectiveNode,
  diagnostics: DocumentDiagnostic[],
): QuickStyleAttributes {
  const semanticAttributes = new Set(({
    theorem: ['title'],
    property: ['title'],
    proposition: ['title'],
    corollary: ['title'],
    lemma: ['title'],
    exercise: ['title'],
    figure: ['caption', 'width', 'placement'],
    table: ['caption', 'placement'],
    listing: ['caption', 'language', 'lineNumbers'],
    'front-section': ['kind', 'title', 'numbered', 'pageStyle'],
  } as Record<string, string[]>)[node.name] ?? []);
  const styleAttributes = Object.fromEntries(
    Object.entries(node.attributes).filter(([key]) => !semanticAttributes.has(key)),
  );
  const validation = validateQuickStyleAttributes(styleAttributes);
  const line = node.startLine > 0 ? ` on ${node.name} line ${node.startLine}` : '';
  for (const error of validation.errors) {
    diagnostics.push({
      code: 'quick-style.invalid',
      message: `${error.replace(/\.$/u, '')}${line}.`,
      severity: 'error',
    });
  }
  for (const warning of validation.warnings) {
    diagnostics.push({
      code: 'quick-style.unknown-property',
      message: `${warning} (${node.name} line ${node.startLine})`,
      severity: 'warning',
    });
  }
  return validation.attributes;
}

function renderQuickStyle(
  body: string,
  style: QuickStyleAttributes,
  node: LmxDirectiveNode,
  diagnostics: DocumentDiagnostic[],
): string {
  const unsupported = new Set<string>();
  const hasTheoremTitle = isTheoremDirective(node.name)
    && typeof node.attributes.title === 'string'
    && node.attributes.title.length > 0;
  if (!hasTheoremTitle) collectUnusedTitleStyles(style, unsupported);
  else if (style.titleLetterSpacingPt !== undefined) unsupported.add('titleLetterSpacingPt');
  if (style.borderRadiusPt !== undefined) unsupported.add('borderRadiusPt');
  if (style.letterSpacingPt !== undefined) unsupported.add('letterSpacingPt');

  const boxSafe = !['figure', 'table', 'listing', 'front-section'].includes(node.name)
    && !/\\begin\{(?:figure|table|lstlisting)\}|\\(?:newpage|clearpage|tableofcontents|listoffigures|listoftables)\b/u.test(body);
  const unsafeBoxProperties = new Set<string>();
  if (!boxSafe) {
    for (const property of ['background', 'borderColor', 'borderWidthPt', 'paddingMm'] as const) {
      if (style[property] !== undefined) {
        unsupported.add(property);
        unsafeBoxProperties.add(property);
      }
    }
  }

  const opening: string[] = ['\\begingroup'];
  const closing: string[] = [];
  const color = hexadecimalColorValue(style.color);
  const background = unsafeBoxProperties.has('background')
    ? undefined
    : hexadecimalColorValue(style.background);
  const borderColor = unsafeBoxProperties.has('borderColor')
    ? undefined
    : hexadecimalColorValue(style.borderColor);
  if (color) opening.push(`\\color[HTML]{${color}}`);
  appendBodyFontCommands(opening, style, unsupported);

  const alignment = style.align === 'left'
    ? 'flushleft'
    : style.align === 'center'
      ? 'center'
      : style.align === 'right'
        ? 'flushright'
        : undefined;
  if (alignment) {
    opening.push(`\\begin{${alignment}}`);
    closing.unshift(`\\end{${alignment}}`);
  } else if (style.align === 'justify') {
    opening.push('\\leftskip=0pt\\relax');
    opening.push('\\rightskip=0pt\\relax');
    opening.push('\\parfillskip=0pt plus 1fil\\relax');
  }

  const padding = unsafeBoxProperties.has('paddingMm') ? 0 : style.paddingMm ?? 0;
  const margin = style.marginMm ?? 0;
  const explicitBorderWidth = unsafeBoxProperties.has('borderWidthPt')
    ? undefined
    : style.borderWidthPt;
  const borderWidth = explicitBorderWidth ?? (borderColor ? 0.4 : 0);
  const hasBox = background !== undefined || borderColor !== undefined || borderWidth > 0 || padding > 0;
  if (hasBox) {
    opening.push(`\\setlength{\\fboxsep}{${latexNumber(padding)}mm}`);
    opening.push(`\\setlength{\\fboxrule}{${latexNumber(borderWidth)}pt}`);
  }

  let content = body;
  if (hasBox) {
    const marginReduction = latexNumber(margin * 2);
    const box = `\\parbox{\\dimexpr\\linewidth-${marginReduction}mm-2\\fboxsep-2\\fboxrule\\relax}{${content}}`;
    if (background) {
      content = borderColor || borderWidth > 0
        ? `\\fcolorbox[HTML]{${borderColor ?? '000000'}}[HTML]{${background}}{${box}}`
        : `\\colorbox[HTML]{${background}}{${box}}`;
    } else if (borderColor) {
      content = `\\colorlet{QuickStyleBodyColor}{.}\\color[HTML]{${borderColor}}\\fbox{\\color{QuickStyleBodyColor}${box}}`;
    } else if (borderWidth > 0) {
      content = `\\fbox{${box}}`;
    } else {
      content = `\\hspace{${latexNumber(padding)}mm}${box}\\hspace{${latexNumber(padding)}mm}`;
    }
  }
  if (margin > 0) {
    content = `\\vspace{${latexNumber(margin)}mm}\n\\noindent\\hspace{${latexNumber(margin)}mm}${content}\\hspace{${latexNumber(margin)}mm}\n\\vspace{${latexNumber(margin)}mm}`;
  }

  appendPreviewOnlyDiagnostics(unsupported, node, diagnostics);
  if (!hasRenderableBodyQuickStyle(style, unsafeBoxProperties)) return body;
  return `${opening.join('\n')}\n${content}\n${[...closing, '\\endgroup'].join('\n')}\n\n`;
}

function formatQuickStyleTitle(
  title: string,
  style: QuickStyleAttributes,
  diagnostics: DocumentDiagnostic[],
  node: LmxDirectiveNode,
): string {
  const commands: string[] = [];
  const unsupported = new Set<string>();
  const titleColor = hexadecimalColorValue(style.titleColor);
  if (titleColor) commands.push(`\\color[HTML]{${titleColor}}`);
  appendFontFamilyCommand(commands, style.titleFontFamily, 'titleFontFamily', unsupported);
  if (style.titleFontSizePt !== undefined) {
    const baseline = style.titleFontSizePt * (style.titleLineHeight ?? 1.2);
    commands.push(`\\fontsize{${latexNumber(style.titleFontSizePt)}}{${latexNumber(baseline)}}\\selectfont`);
  } else if (style.titleLineHeight !== undefined) {
    commands.push(`\\linespread{${latexNumber(style.titleLineHeight)}}\\selectfont`);
  }
  appendFontWeightCommand(commands, style.titleFontWeight, 'titleFontWeight', unsupported);
  appendFontStyleCommand(commands, style.titleFontStyle);
  appendPreviewOnlyDiagnostics(unsupported, node, diagnostics);
  const escaped = escapeLatexText(title);
  return commands.length === 0 ? escaped : `{${commands.join('')} ${escaped}}`;
}

function appendBodyFontCommands(
  commands: string[],
  style: QuickStyleAttributes,
  unsupported: Set<string>,
): void {
  appendFontFamilyCommand(commands, style.fontFamily, 'fontFamily', unsupported);
  if (style.fontSizePt !== undefined) {
    const baseline = style.fontSizePt * (style.lineHeight ?? 1.2);
    commands.push(`\\fontsize{${latexNumber(style.fontSizePt)}}{${latexNumber(baseline)}}\\selectfont`);
  } else if (style.lineHeight !== undefined) {
    commands.push(`\\linespread{${latexNumber(style.lineHeight)}}\\selectfont`);
  }
  appendFontWeightCommand(commands, style.fontWeight, 'fontWeight', unsupported);
  appendFontStyleCommand(commands, style.fontStyle);
}

function appendFontFamilyCommand(
  commands: string[],
  value: string | undefined,
  property: string,
  unsupported: Set<string>,
): void {
  if (value === undefined) return;
  const command = ({
    serif: '\\rmfamily',
    roman: '\\rmfamily',
    'sans-serif': '\\sffamily',
    sans: '\\sffamily',
    monospace: '\\ttfamily',
    typewriter: '\\ttfamily',
  } as Record<string, string>)[value];
  if (command) commands.push(command);
  else unsupported.add(property);
}

function appendFontWeightCommand(
  commands: string[],
  value: QuickStyleFontWeight | undefined,
  property: string,
  unsupported: Set<string>,
): void {
  if (value === undefined) return;
  if (value === '600' || value === '700') commands.push('\\bfseries');
  else if (value === '400' || value === '500') commands.push('\\mdseries');
  else unsupported.add(property);
}

function appendFontStyleCommand(
  commands: string[],
  value: QuickStyleFontStyle | undefined,
): void {
  if (value === 'italic') commands.push('\\itshape');
  else if (value === 'normal') commands.push('\\upshape');
}

function appendPreviewOnlyDiagnostics(
  properties: ReadonlySet<string>,
  node: LmxDirectiveNode,
  diagnostics: DocumentDiagnostic[],
): void {
  for (const property of [...properties].sort()) {
    diagnostics.push({
      code: 'latex.quick-style-preview-only',
      message: `Quick Edit ${property} on ${node.name} line ${node.startLine} is preview-only and was not exported to TeX.`,
      severity: 'warning',
    });
  }
}

function warnUnrenderedQuickStyle(
  style: QuickStyleAttributes,
  node: LmxDirectiveNode,
  diagnostics: DocumentDiagnostic[],
): void {
  const unused = new Set<string>();
  for (const [property, value] of Object.entries(style)) {
    if (value !== undefined && property !== 'component' && property !== 'theme') {
      unused.add(property);
    }
  }
  appendPreviewOnlyDiagnostics(unused, node, diagnostics);
}

function collectUnusedTitleStyles(
  style: QuickStyleAttributes,
  unused: Set<string>,
): void {
  for (const property of [
    'titleColor', 'titleFontFamily', 'titleFontSizePt', 'titleFontWeight', 'titleFontStyle',
    'titleLineHeight', 'titleLetterSpacingPt',
  ] as const) {
    if (style[property] !== undefined) unused.add(property);
  }
}

function isTheoremDirective(name: string): boolean {
  return ['theorem', 'property', 'proposition', 'corollary', 'lemma', 'exercise'].includes(name);
}

function hasRenderableBodyQuickStyle(
  style: QuickStyleAttributes,
  omittedProperties: ReadonlySet<string>,
): boolean {
  const titleProperties = new Set([
    'titleColor', 'titleFontFamily', 'titleFontSizePt', 'titleFontWeight', 'titleFontStyle',
    'titleLineHeight', 'titleLetterSpacingPt',
  ]);
  const previewOnlyProperties = new Set(['borderRadiusPt', 'letterSpacingPt']);
  return Object.entries(style).some(([key, value]) => (
    value !== undefined
      && key !== 'component'
      && key !== 'theme'
      && !titleProperties.has(key)
      && !previewOnlyProperties.has(key)
      && !omittedProperties.has(key)
  ));
}

function hexadecimalColorValue(value: string | undefined): string | undefined {
  return value?.slice(1).toUpperCase();
}

function latexNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

function readSettings(data: Record<string, unknown>): ThemeDocumentSettings {
  const lmx = recordValue(data.lmx);
  const cover = mergedRecord(recordValue(data.cover), recordValue(lmx.cover));
  const structure = mergedRecord(recordValue(data.structure), recordValue(lmx.structure));
  const header = mergedRecord(recordValue(data.header), recordValue(lmx.header));
  const footer = mergedRecord(recordValue(data.footer), recordValue(lmx.footer));
  const rawStudents = Array.isArray(cover.students) ? cover.students : [];
  const students = rawStudents.flatMap((value) => {
    const student = recordValue(value);
    return typeof student.name === 'string'
      && typeof student.id === 'string'
      && (student.name.trim().length > 0 || student.id.trim().length > 0)
      ? [{ name: student.name, id: student.id }]
      : [];
  });
  return {
    ...defaultSettings,
    title: stringValue(cover.title) ?? defaultSettings.title,
    university: stringValue(cover.university) ?? defaultSettings.university,
    school: stringValue(cover.school) ?? defaultSettings.school,
    faculty: stringValue(cover.faculty) ?? defaultSettings.faculty,
    reportType: stringValue(cover.reportType) ?? defaultSettings.reportType,
    major: stringValue(cover.major),
    council: stringValue(cover.council),
    supervisor: stringValue(cover.supervisor),
    secretary: stringValue(cover.secretary),
    students,
    locationDate: stringValue(cover.locationDate),
    coverHeading: stringValue(cover.heading) ?? defaultSettings.coverHeading,
    coverLogoEnabled: booleanValue(cover.logoEnabled) ?? defaultSettings.coverLogoEnabled,
    coverLogoWidthCm: rangedNumberValue(cover.logoWidthCm, 1, 8) ?? defaultSettings.coverLogoWidthCm,
    coverBorderEnabled: booleanValue(cover.borderEnabled) ?? defaultSettings.coverBorderEnabled,
    coverOuterBorderWidthPt: rangedNumberValue(cover.outerBorderWidthPt, 0, 10) ?? defaultSettings.coverOuterBorderWidthPt,
    coverInnerBorderWidthPt: rangedNumberValue(cover.innerBorderWidthPt, 0, 10) ?? defaultSettings.coverInnerBorderWidthPt,
    headerEnabled: booleanValue(header.enabled) ?? defaultSettings.headerEnabled,
    headerInstitution: stringValue(header.institution) ?? defaultSettings.headerInstitution,
    headerFaculty: stringValue(header.faculty) ?? stringValue(cover.faculty) ?? defaultSettings.headerFaculty,
    headerLogoEnabled: booleanValue(header.logoEnabled) ?? defaultSettings.headerLogoEnabled,
    headerLogoSizeMm: rangedNumberValue(header.logoSizeMm, 4, 14) ?? defaultSettings.headerLogoSizeMm,
    headerFontSizePt: rangedNumberValue(header.fontSizePt, 6, 16) ?? defaultSettings.headerFontSizePt,
    headerBold: booleanValue(header.bold) ?? defaultSettings.headerBold,
    headerRuleEnabled: booleanValue(header.ruleEnabled) ?? defaultSettings.headerRuleEnabled,
    headerRuleWidthPt: rangedNumberValue(header.ruleWidthPt, 0, 2) ?? defaultSettings.headerRuleWidthPt,
    footerEnabled: booleanValue(footer.enabled) ?? defaultSettings.footerEnabled,
    footerLeft: stringValue(footer.left) ?? defaultSettings.footerLeft,
    footerPageNumber: pageNumberValue(footer.pageNumber) ?? defaultSettings.footerPageNumber,
    footerFontSizePt: rangedNumberValue(footer.fontSizePt, 6, 14) ?? defaultSettings.footerFontSizePt,
    footerRuleEnabled: booleanValue(footer.ruleEnabled) ?? defaultSettings.footerRuleEnabled,
    footerRuleWidthPt: rangedNumberValue(footer.ruleWidthPt, 0, 2) ?? defaultSettings.footerRuleWidthPt,
    tocDepth: tocDepthValue(structure.tocDepth) ?? defaultSettings.tocDepth,
    includeCover: booleanValue(structure.cover) ?? defaultSettings.includeCover,
    includeToc: booleanValue(structure.toc) ?? defaultSettings.includeToc,
    includeListOfFigures: booleanValue(structure.listOfFigures) ?? defaultSettings.includeListOfFigures,
    includeListOfTables: booleanValue(structure.listOfTables) ?? defaultSettings.includeListOfTables,
  };
}

function mergedRecord(
  legacy: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  return { ...legacy, ...current };
}

function pageNumberValue(value: unknown): ThemeDocumentSettings['footerPageNumber'] | undefined {
  return value === 'current-total' || value === 'current' || value === 'none' ? value : undefined;
}

function tocDepthValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4
    ? value
    : undefined;
}

function rangedNumberValue(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function stringAttribute(node: LmxDirectiveNode, key: string): string | undefined {
  return stringValue(node.attributes[key]);
}

function numericAttribute(node: LmxDirectiveNode, key: string): number | undefined {
  const value = node.attributes[key];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1) return value;
  if (typeof value === 'string') {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0 && number <= 1) return number;
  }
  return undefined;
}

function safePlacement(value: string | undefined): string {
  return value && /^[htbp!]+$/.test(value) ? value : 'htbp';
}

function sanitizeLabel(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, '-');
}

const offlineListingLanguages: Readonly<Record<string, string>> = {
  bash: 'bash',
  c: 'C',
  'c++': 'C++',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JavaScript',
  python: 'python',
  r: 'R',
  sh: 'sh',
  swift: 'swift',
  typescript: 'JavaScript',
  ts: 'JavaScript',
  xml: 'XML',
};

function listingLanguageOption(
  value: string | null | undefined,
  diagnostics: DocumentDiagnostic[],
  line?: number,
): string {
  const requested = value?.trim() ?? '';
  if (!requested || requested.toLowerCase() === 'text' || requested.toLowerCase() === 'plaintext') {
    return '';
  }
  const language = offlineListingLanguages[requested.toLowerCase()];
  if (language) return `language=${language}`;
  diagnostics.push({
    code: 'latex.listing-language-unsupported',
    message: `Code fence language ${requested} is not supported by the offline PDF renderer; exported as plain code${line ? ` (line ${line})` : ''}.`,
    severity: 'warning',
  });
  return '';
}

function sanitizeToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_+-]/g, '') || 'text';
}

function isSafeAssetPath(value: string): boolean {
  if (value.startsWith('/') || value.includes('\\') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
  return !value.split('/').some((component) => component === '..' || component === '');
}

function renderLatexAssetPath(
  value: string,
  diagnostics: DocumentDiagnostic[],
  line?: number,
): string | undefined {
  if (!isSafeAssetPath(value) || /[%{}^\u0000-\u001F\u007F-\u009F]/u.test(value)) {
    diagnostics.push({
      code: 'latex.unsafe-asset-path',
      message: `Asset path${line ? ` on line ${line}` : ''} contains unsafe path or TeX syntax.`,
      severity: 'error',
    });
    return undefined;
  }
  return `\\detokenize{${value}}`;
}

function validateListingContent(
  value: string,
  diagnostics: DocumentDiagnostic[],
  line?: number,
): boolean {
  if (!/\\end\s*\{\s*lstlisting\s*\}/i.test(value)) return true;
  diagnostics.push({
    code: 'latex.unsafe-listing-terminator',
    message: `Code listing${line ? ` on line ${line}` : ''} contains a reserved lstlisting terminator.`,
    severity: 'error',
  });
  return false;
}

function frontSectionTitle(kind: string | undefined): string {
  return ({
    acknowledgements: 'Lời cảm ơn',
    declaration: 'Lời cam đoan',
    abstract: 'Tóm tắt',
  } as Record<string, string>)[kind ?? ''] ?? 'Phần mở đầu';
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
