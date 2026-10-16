import { parseFrontMatter, parseLmx } from '@markdown/document-core';
import type { StructurePreviewRenderer } from '@markdown/muya-core';
import { compileAuthoredTheme, type AuthoredThemeCompilation, type AuthoredLayout, type ThemeSceneNode, type ThemeSceneV2 } from '@markdown/theme-engine';
import { hcmutLogoUrl } from '@markdown/theme-hcmut-report-v1';
import type { VisualPageDecorationSettings } from './visual-page-flow';

export function readVisualPageDecorationSettings(markdown: string): VisualPageDecorationSettings {
  const data = parseFrontMatter(markdown).data;
  const lmx = record(data.lmx);
  if (lmx.authoredTheme !== undefined) {
    const compiled = compileAuthoredTheme(lmx.authoredTheme, data);
    const settings = readAuthoredPageDecorations(data, compiled.resolvedScene);
    if (compiled.headerLayout) settings.header.renderContent = () => renderAuthoredLayoutPreview(compiled.headerLayout!);
    if (compiled.footerLayout) settings.footer.renderContent = () => renderAuthoredLayoutPreview(compiled.footerLayout!);
    return settings;
  }
  const structure = mergedRecord(record(data.structure), record(lmx.structure));
  const cover = mergedRecord(record(data.cover), record(lmx.cover));
  const header = mergedRecord(record(data.header), record(lmx.header));
  const footer = mergedRecord(record(data.footer), record(lmx.footer));
  const pageNumber = stringValue(footer.pageNumber, 'current-total');

  return {
    cover: {
      heading: stringValue(cover.heading, 'BÁO CÁO'),
      logoEnabled: cover.logoEnabled !== false,
      logoWidthCm: numberValue(cover.logoWidthCm, 4, 1, 8),
      borderEnabled: cover.borderEnabled !== false,
      outerBorderWidthPt: numberValue(cover.outerBorderWidthPt, 4, 0, 10),
      innerBorderWidthPt: numberValue(cover.innerBorderWidthPt, 1.5, 0, 10),
    },
    structure: {
      cover: structure.cover !== false,
      toc: structure.toc !== false,
      listOfFigures: structure.listOfFigures !== false,
      listOfTables: structure.listOfTables !== false,
    },
    header: {
      enabled: header.enabled !== false,
      institution: stringValue(
        header.institution,
        'Trường Đại Học Bách Khoa - Đại học Quốc gia TP.HCM',
      ),
      faculty: stringValue(
        header.faculty,
        stringValue(cover.faculty, 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH'),
      ),
      logoEnabled: header.logoEnabled !== false,
      logoSizeMm: numberValue(header.logoSizeMm, 10, 4, 14),
      fontSizePt: numberValue(header.fontSizePt, 9, 6, 16),
      bold: header.bold !== false,
      ruleEnabled: header.ruleEnabled !== false,
      ruleWidthPt: numberValue(header.ruleWidthPt, 0.3, 0, 2),
    },
    footer: {
      enabled: footer.enabled !== false,
      left: stringValue(
        footer.left,
        'Báo cáo Đồ án chuyên ngành/Đồ án kỹ thuật máy tính/Đồ án môn học (CO4029/CO4041/...) - HK1 2023 - 2024',
      ),
      pageNumber: pageNumber === 'current' || pageNumber === 'none' ? pageNumber : 'current-total',
      fontSizePt: numberValue(footer.fontSizePt, 8, 6, 14),
      ruleEnabled: footer.ruleEnabled !== false,
      ruleWidthPt: numberValue(footer.ruleWidthPt, 0.3, 0, 2),
    },
  };
}

export function createHcmutStructurePreviewRenderer(
  getMarkdown: () => string,
): StructurePreviewRenderer {
  return ({ name, container }) => renderHcmutStructurePreview(name, container, getMarkdown);
}

/** Rebuild generated front-matter previews after a live Muya content change. */
export function refreshHcmutStructurePreviews(
  editor: HTMLElement,
  getMarkdown: () => string,
): void {
  editor.querySelectorAll<HTMLElement>('.mu-lmx-structure-preview').forEach((container) => {
    const name = container.closest<HTMLElement>('[data-lmx-name]')?.dataset.lmxName;
    if (!name || !previewNames.has(name)) return;
    container.replaceChildren();
    container.classList.remove('visual-page-preview', 'visual-structure-disabled');
    delete container.dataset.structureEnabled;
    renderHcmutStructurePreview(name, container, getMarkdown);
  });
}

const previewNames = new Set(['theme-layout', 'cover', 'toc', 'list-of-figures', 'list-of-tables', 'pagebreak']);

function renderHcmutStructurePreview(
  name: string,
  container: HTMLElement,
  getMarkdown: () => string,
): void {
  if (name === 'pagebreak') {
    renderPageBreakPreview(container);
    return;
  }
  const markdown = getMarkdown();
  const data = parseFrontMatter(markdown).data;
  const lmx = record(data.lmx);
  if (lmx.authoredTheme !== undefined) {
    const compiled = compileAuthoredTheme(lmx.authoredTheme, data);
    if (!compiled.snapshot) {
      container.dataset.structureEnabled = 'false';
      container.classList.remove('visual-page-preview');
      container.classList.add('visual-structure-disabled');
      appendText(container, 'visual-structure-disabled-label', compiled.errors.join('\n'));
      return;
    }
    if (name === 'theme-layout') {
      const id = container.dataset.authoredLayoutNodeId;
      const find = (layout: AuthoredLayout): AuthoredLayout | undefined => layout.node.id === id
        ? layout : layout.children.map(find).find(Boolean);
      const layout = compiled.layout && find(compiled.layout);
      if (!layout || !['section','row','column','text','image-placeholder'].includes(layout.node.widget)) {
        showAuthoredLayoutError(container, `Unknown authored layout node: ${id ?? '(missing)'}.`);
        return;
      }
      container.dataset.structureEnabled = 'true';
      container.classList.remove('visual-structure-disabled');
      container.append(renderAuthoredLayoutPreview(layout));
      return;
    }
    const scene = compiled.resolvedScene ?? compiled.snapshot.scene;
    const settings = readAuthoredPageDecorations(data, scene);
    if (!isStructureEnabled(name, settings)) {
      container.dataset.structureEnabled = 'false';
      container.classList.remove('visual-page-preview');
      container.classList.add('visual-structure-disabled');
      appendText(container, 'visual-structure-disabled-label', `${structureTitle(name)} is disabled in this authored theme.`);
      return;
    }
    container.dataset.structureEnabled = 'true';
    container.classList.remove('visual-structure-disabled');
    container.classList.add('visual-page-preview');
    if (name === 'cover') renderAuthoredCoverPreview(container, markdown, scene, compiled.coverLayout);
    else renderGeneratedListPreview(container, name, markdown);
    return;
  }
  if (name === 'theme-layout') {
    showAuthoredLayoutError(container, 'Unknown authored layout node: no validated authored theme.');
    return;
  }
  const settings = readVisualPageDecorationSettings(markdown);
  if (!isStructureEnabled(name, settings)) {
    container.dataset.structureEnabled = 'false';
    container.classList.add('visual-structure-disabled');
    appendText(container, 'visual-structure-disabled-label', `${structureTitle(name)} đang tắt trong Properties`);
    return;
  }
  container.dataset.structureEnabled = 'true';
  container.classList.add('visual-page-preview');
  if (name === 'cover') renderCoverPreview(container, markdown, settings);
  else renderGeneratedListPreview(container, name, markdown);
}

function showAuthoredLayoutError(container: HTMLElement, message: string): void {
  container.dataset.structureEnabled = 'false';
  container.classList.add('visual-structure-disabled');
  appendText(container, 'visual-structure-disabled-label', message);
}

/** Render page-region trees using exactly the same layout as section/cover.
 * Returns false for a leaf/absent region, leaving the existing text renderer in charge. */
export function renderAuthoredPageRegion(container: HTMLElement, markdown: string, region: 'header' | 'footer'): boolean {
  const data = parseFrontMatter(markdown).data;
  const compiled = compileAuthoredTheme(record(data.lmx).authoredTheme, data);
  const layout = region === 'header' ? compiled.headerLayout : compiled.footerLayout;
  if (!layout || layout.node.properties.enabled === false) return false;
  container.replaceChildren(renderAuthoredLayoutPreview(layout));
  return true;
}

function authoredNode(scene: ThemeSceneV2 | undefined, widget: string): ThemeSceneNode | undefined {
  const visit = (node: ThemeSceneNode): ThemeSceneNode | undefined =>
    node.widget === widget ? node : ['cover','header','footer','section','row','column'].includes(node.widget) ? undefined : node.children.map(visit).find(Boolean);
  return scene && visit(scene.root);
}

/** Only called with compiler-validated scenes: resolve its supported typography. */
function authoredStyle(scene: ThemeSceneV2, target?: ThemeSceneNode): Record<string, string | number> {
  const visit = (node: ThemeSceneNode, inherited: Record<string, string | number>): Record<string, string | number> | undefined => {
    const style = { ...inherited };
    delete style.background;
    for (const key of Object.keys(node.style).sort()) {
      const raw = node.style[key];
      const value = typeof raw === 'object' && raw !== null && 'token' in raw
        ? scene.tokens[String(raw.token)]?.value : raw;
      if (typeof value === 'string' || typeof value === 'number') style[key === 'accent' ? 'color' : key] = value;
    }
    if (node.id === (target?.id ?? scene.root.id)) return style;
    return node.children.map(child => visit(child, style)).find(Boolean);
  };
  return visit(scene.root, {}) ?? {};
}

function readAuthoredPageDecorations(
  data: Record<string, unknown>, scene: ThemeSceneV2 | undefined,
): VisualPageDecorationSettings {
  const lmx = record(data.lmx);
  const structure = mergedRecord(record(data.structure), record(lmx.structure));
  const cover = authoredNode(scene, 'cover'), header = authoredNode(scene, 'header'), footer = authoredNode(scene, 'footer');
  const enabled = (node?: ThemeSceneNode): boolean => !!node && node.properties.enabled !== false;
  const text = (node: ThemeSceneNode | undefined, ...keys: string[]): string => {
    for (const key of keys) if (typeof node?.properties[key] === 'string') return String(node.properties[key]);
    return '';
  };
  const headerText = enabled(header) ? text(header, 'text', 'institution', 'title') : '';
  const footerText = enabled(footer) ? text(footer, 'left', 'text', 'title') : '';
  const pageNumber = authoredNode(scene, 'page-number');
  const format = pageNumber?.properties.format ?? footer?.properties.format ?? (enabled(footer) ? 'current' : 'none');
  const headerStyle = scene ? authoredStyle(scene, header) : {};
  const footerStyle = scene ? authoredStyle(scene, footer) : {};
  return {
    cover: { heading: '', logoEnabled: false, logoWidthCm: 4, borderEnabled: false, outerBorderWidthPt: 0, innerBorderWidthPt: 0 },
    structure: {
      cover: enabled(cover) && structure.cover !== false,
      toc: !!scene && structure.toc !== false,
      listOfFigures: !!scene && structure.listOfFigures !== false,
      listOfTables: !!scene && structure.listOfTables !== false,
    },
    header: {
      enabled: enabled(header), institution: headerText, faculty: '', logoEnabled: false, logoSizeMm: 10,
      fontSizePt: Number(headerStyle.fontSizePt ?? 11),
      bold: headerStyle.fontWeight === 'bold' || Number(headerStyle.fontWeight) >= 600,
      ruleEnabled: !!headerText, ruleWidthPt: 0.3,
    },
    footer: {
      enabled: enabled(footer) || format === 'current' || format === 'current-total', left: footerText,
      pageNumber: format === 'current' || format === 'current-total' ? format : 'none',
      fontSizePt: Number(footerStyle.fontSizePt ?? 11), ruleEnabled: !!footerText, ruleWidthPt: 0.3,
    },
  };
}

/** Plain titlepage semantics from the independent compiler, never HCMUT defaults.
 * DOM is a flow approximation; TeX remains the authority for final pagination.
 */
function renderAuthoredCoverPreview(
  container: HTMLElement, markdown: string, scene: ThemeSceneV2,
  layout?: AuthoredThemeCompilation['coverLayout'],
): void {
  const node = authoredNode(scene, 'cover');
  if (!node) return;
  const data = parseFrontMatter(markdown).data;
  const metadata = mergedRecord(record(data.cover), record(record(data.lmx).cover));
  const style = authoredStyle(scene, node);
  const content = document.createElement('div');
  content.className = 'authored-cover-content';
  content.dataset.authoredNodeId = node.id;
  content.dataset.authoredWidget = node.widget;
  Object.assign(content.style, {
    display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
    minHeight: '810px', height: '100%', padding: '20mm 25mm', overflowWrap: 'anywhere',
    textAlign: node.properties.alignment === 'leading' ? 'left' : node.properties.alignment === 'trailing' ? 'right' : 'center',
    color: String(style.color ?? '#000000'),
    fontFamily: style.fontFamily === 'sans-serif' ? 'Arial, sans-serif' : style.fontFamily === 'monospace' ? 'monospace' : '"Times New Roman", serif',
    fontSize: `${style.fontSizePt ?? 11}pt`, lineHeight: String(style.lineHeight ?? 1.35),
    fontWeight: style.fontWeight === 'bold' || Number(style.fontWeight) >= 600 ? 'bold' : 'normal',
    fontStyle: style.fontStyle === 'italic' ? 'italic' : 'normal',
  });
  if (layout) {
    delete content.dataset.authoredNodeId;
    delete content.dataset.authoredWidget;
    content.append(renderAuthoredLayoutPreview(layout));
    container.append(content);
    return;
  }
  const field = (key: string, fallback = ''): HTMLElement => {
    const element = document.createElement('div');
    element.dataset.coverField = key;
    element.textContent = stringValue(node.properties[key], fallback);
    element.style.marginBottom = '6pt';
    content.append(element);
    return element;
  };
  for (const key of ['university', 'school', 'faculty', 'reportType']) field(key);
  const title = field('title', stringValue(metadata.title, 'Báo cáo Markdown'));
  title.style.marginTop = 'auto';
  title.style.marginBottom = '12pt';
  title.style.fontSize = '17.28pt'; // article's default \\LARGE, also used by the compiler.
  for (const key of ['major', 'council', 'supervisor', 'secretary']) field(key);
  for (const student of Array.isArray(metadata.students) ? metadata.students : []) {
    const value = record(student);
    appendText(content, 'authored-cover-student', `${stringValue(value.name, '')}  ${stringValue(value.id, '')}`);
  }
  field('locationDate').style.marginTop = 'auto';
  container.append(content);
}

export function renderAuthoredLayoutPreview(current: AuthoredLayout): HTMLElement {
    const { node: currentNode, style: nodeStyle, widthMm, gapMm, paddingMm, children } = current;
    const element = document.createElement('div');
    element.dataset.authoredNodeId = currentNode.id;
    element.dataset.authoredWidget = currentNode.widget;
    element.dataset.themeNodeId = currentNode.id;
    element.dataset.themeWidget = currentNode.widget;
    element.dataset.widthMm = String(widthMm);
    Object.assign(element.style, {
      boxSizing: 'border-box', width: `${widthMm}mm`, minWidth: '0', flexShrink: '0',
      padding: `${paddingMm}mm`,
      textAlign: currentNode.properties.alignment === 'center' ? 'center'
        : currentNode.properties.alignment === 'trailing' ? 'right' : 'left',
      color: String(nodeStyle.color ?? '#000000'),
      fontFamily: nodeStyle.fontFamily === 'sans-serif' ? 'Arial, sans-serif'
        : nodeStyle.fontFamily === 'monospace' ? 'monospace' : '"Times New Roman", serif',
      fontSize: `${nodeStyle.fontSizePt ?? 11}pt`, lineHeight: String(nodeStyle.lineHeight ?? 1.35),
      fontWeight: nodeStyle.fontWeight === 'bold' || Number(nodeStyle.fontWeight) >= 600 ? 'bold' : 'normal',
      fontStyle: nodeStyle.fontStyle === 'italic' ? 'italic' : 'normal',
    });
    if (nodeStyle.background) element.style.backgroundColor = String(nodeStyle.background);
    if (currentNode.widget === 'image-placeholder') {
      element.style.height = `${currentNode.properties.heightMm ?? 30}mm`;
      element.style.display = 'flex';
      element.style.alignItems = 'center';
      element.style.overflowWrap = 'anywhere';
      element.textContent = `Image placeholder${typeof currentNode.properties.alt === 'string' && currentNode.properties.alt ? ': ' + currentNode.properties.alt : ''}`;
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', element.textContent);
      return element;
    }
    if (currentNode.widget === 'text') {
      element.style.whiteSpace = 'pre-line';
      element.textContent = stringValue(currentNode.properties.text, '');
      return element;
    }
    element.style.display = 'flex';
    element.style.flexDirection = currentNode.widget === 'row' ? 'row' : 'column';
    element.style.alignItems = 'flex-start';
    element.style.gap = `${gapMm}mm`;
    // Empty rows are designer placeholders, not printed geometry.
    children.filter(child => child.node.widget !== 'row' || child.children.length > 0)
      .forEach(child => element.append(renderAuthoredLayoutPreview(child)));
    return element;
}

function isStructureEnabled(
  name: string,
  settings: VisualPageDecorationSettings,
): boolean {
  switch (name) {
    case 'cover': return settings.structure.cover;
    case 'toc': return settings.structure.toc;
    case 'list-of-figures': return settings.structure.listOfFigures;
    case 'list-of-tables': return settings.structure.listOfTables;
    default: return true;
  }
}

function structureTitle(name: string): string {
  switch (name) {
    case 'cover': return 'Trang bìa';
    case 'toc': return 'Mục lục';
    case 'list-of-figures': return 'Danh sách hình';
    case 'list-of-tables': return 'Danh sách bảng';
    default: return name;
  }
}

function renderPageBreakPreview(container: HTMLElement): void {
  container.classList.add('hcmut-pagebreak-preview');
}

function renderCoverPreview(
  container: HTMLElement,
  markdown: string,
  settings: VisualPageDecorationSettings,
): void {
  const data = parseFrontMatter(markdown).data;
  const cover = mergedRecord(record(data.cover), record(record(data.lmx).cover));
  const university = stringValue(cover.university, 'ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH');
  const school = stringValue(cover.school, 'TRƯỜNG ĐẠI HỌC BÁCH KHOA');
  const faculty = stringValue(cover.faculty, 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH');
  const reportType = stringValue(cover.reportType, 'ĐỒ ÁN MÔN HỌC');
  const title = stringValue(cover.title, 'Báo cáo Markdown');
  const major = stringValue(cover.major, '');
  const council = stringValue(cover.council, '');
  const supervisor = stringValue(cover.supervisor, '');
  const secretary = stringValue(cover.secretary, '');
  const locationDate = stringValue(cover.locationDate, 'TP. HỒ CHÍ MINH');
  const students = Array.isArray(cover.students) ? cover.students : [];
  const compact = students.length > 3
    || [university, school, faculty, reportType, title, major, settings.cover.heading, locationDate]
      .some(value => value.length > 70 || /\S{24,}/u.test(value));

  if (settings.cover.borderEnabled) {
    const border = document.createElement('div');
    border.className = 'hcmut-cover-border';
    border.style.borderWidth = `${settings.cover.outerBorderWidthPt * 96 / 72}px`;
    border.style.setProperty('--cover-inner-border-width', `${settings.cover.innerBorderWidthPt * 96 / 72}px`);
    container.append(border);
  }

  const content = document.createElement('div');
  content.className = 'hcmut-cover-content';
  if (compact) content.classList.add('hcmut-cover-compact');
  appendText(content, 'hcmut-cover-university', university);
  appendText(content, 'hcmut-cover-school', school);
  appendText(content, 'hcmut-cover-faculty', faculty);

  if (settings.cover.logoEnabled) {
    const logo = document.createElement('img');
    logo.className = 'hcmut-cover-logo';
    logo.src = hcmutLogoUrl;
    logo.alt = 'HCMUT';
    const logoWidth = settings.cover.logoWidthCm * 96 / 2.54;
    logo.style.width = `${logoWidth}px`;
    logo.style.height = `${logoWidth}px`;
    logo.addEventListener('error', () => logo.remove());
    content.append(logo);
  }

  appendText(content, 'hcmut-cover-report-heading', settings.cover.heading);
  appendText(content, 'hcmut-cover-report-type', reportType);
  appendText(content, 'hcmut-cover-title', title);
  if (major) appendText(content, 'hcmut-cover-major', `NGÀNH: ${major}`);

  const details = document.createElement('div');
  details.className = 'hcmut-cover-details';
  appendDetail(details, 'HỘI ĐỒNG', council);
  appendDetail(details, 'GVHD', supervisor);
  appendDetail(details, 'TKHĐ', secretary);
  const separator = document.createElement('div');
  separator.className = 'hcmut-cover-separator';
  separator.textContent = '---o0o---';
  details.append(separator);
  const studentContainer = compact ? document.createElement('div') : details;
  if (compact) {
    studentContainer.className = 'hcmut-cover-students';
    details.append(studentContainer);
  }
  for (const [index, value] of students.entries()) {
    const student = record(value);
    const name = stringValue(student.name, '');
    const id = stringValue(student.id, '');
    appendDetail(studentContainer, `SVTH${index + 1}`, [name, id && `(${id})`].filter(Boolean).join(' '));
  }
  content.append(details);
  appendText(content, 'hcmut-cover-location', locationDate);
  container.append(content);
  if (compact) {
    // Measure after attachment, including bundled font/logo layout. Use local
    // layout dimensions so editor zoom cannot alter fitting or persisted text.
    const fit = (): void => {
      if (!content.isConnected) return;
      const available = container.clientHeight - 160;
      if (available > 0 && content.scrollHeight > 0) {
        content.style.transform = `scale(${Math.min(1, available / content.scrollHeight)})`;
      }
    };
    requestAnimationFrame(fit);
    content.querySelector('img')?.addEventListener('load', fit, { once: true });
    void document.fonts?.ready.then(fit);
  }
}

function renderGeneratedListPreview(container: HTMLElement, name: string, markdown: string): void {
  const title = name === 'toc'
    ? 'Mục lục'
    : name === 'list-of-figures' ? 'Danh sách hình vẽ' : 'Danh sách bảng';
  appendText(container, 'hcmut-generated-title', title);
  const list = document.createElement('div');
  list.className = 'hcmut-generated-list';
  if (name === 'toc') {
    const parsed = parseFrontMatter(markdown);
    const structure = record(record(parsed.data.lmx).structure);
    const tocDepth = numberValue(structure.tocDepth, 3, 1, 4);
    const headings = numberTocHeadings(extractTocHeadings(parsed.body, tocDepth)).slice(0, 18);
    for (const heading of headings) {
      appendTocRow(list, heading);
    }
  } else {
    const parsed = parseFrontMatter(markdown);
    const targetName = name === 'list-of-figures' ? 'figure' : 'table';
    const directives = parseLmx(parsed.body).directives
      .filter((directive) => directive.name === targetName)
      .slice(0, 18);
    for (const [index, directive] of directives.entries()) {
      const caption = typeof directive.attributes.caption === 'string'
        ? directive.attributes.caption
        : directive.identifier ?? `${targetName} ${index + 1}`;
      const prefix = targetName === 'figure' ? `Hình ${index + 1}` : `Bảng ${index + 1}`;
      appendGeneratedRow(list, prefix, caption, index + 1, targetName);
    }
  }
  if (list.childElementCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'hcmut-generated-empty';
    empty.textContent = name === 'toc' ? 'Mục lục sẽ được tạo từ các heading.' : 'Chưa có mục nào.';
    list.append(empty);
  }
  container.append(list);
}

function numberTocHeadings(
  headings: Array<{ level: number; text: string }>,
): Array<{ level: number; text: string; number: string }> {
  const counters = [0, 0, 0, 0];
  return headings.map((heading) => {
    const index = heading.level - 1;
    counters[index] += 1;
    counters.fill(0, index + 1);
    const parts = counters.slice(0, heading.level).map(String);
    if (heading.level === 4) parts[3] = alphabeticCounter(counters[3]);
    return {
      ...heading,
      number: parts.join('.'),
    };
  });
}

function alphabeticCounter(value: number): string {
  let remaining = Math.max(1, value);
  let result = '';
  while (remaining > 0) {
    remaining -= 1;
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return result;
}

function appendTocRow(
  list: HTMLElement,
  heading: { level: number; text: string; number: string },
): void {
  const row = document.createElement('div');
  row.className = `hcmut-generated-row level-${heading.level}`;
  row.dataset.tocLevel = String(heading.level);
  appendText(row, 'hcmut-generated-number', heading.number);
  appendText(row, 'hcmut-generated-label', heading.text);
  appendText(row, 'hcmut-generated-leader', '');
  appendText(row, 'hcmut-generated-page', '');
  list.append(row);
}

function extractTocHeadings(source: string, tocDepth: number): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  let fence: { marker: '`' | '~'; length: number } | null = null;

  for (const line of source.split(/\r?\n/)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1][0] as '`' | '~';
      const length = fenceMatch[1].length;
      if (fence === null) {
        fence = { marker, length };
      } else if (
        marker === fence.marker
        && length >= fence.length
        && (fenceMatch[2] ?? '').trim().length === 0
      ) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) continue;

    const headingMatch = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
    const marker = headingMatch?.[1];
    if (!marker) continue;
    const level = Math.min(marker.length, 4);
    const latexTocLevel = Math.min(level, 3);
    if (latexTocLevel > tocDepth) continue;
    const text = (headingMatch[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim();
    if (text.length > 0) headings.push({ level, text });
  }

  return headings;
}

function appendGeneratedRow(
  list: HTMLElement,
  prefix: string,
  label: string,
  index: number,
  targetName: string,
): void {
  const row = document.createElement('div');
  row.className = 'hcmut-generated-row level-1';
  row.dataset.generatedTarget = targetName;
  row.dataset.generatedIndex = String(index);
  appendText(row, 'hcmut-generated-number', String(index));
  appendText(row, 'hcmut-generated-label', label);
  appendText(row, 'hcmut-generated-leader', '');
  appendText(row, 'hcmut-generated-page', '');
  list.append(row);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mergedRecord(
  legacy: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  return { ...legacy, ...current };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function appendText(parent: HTMLElement, className: string, text: string): void {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  parent.append(element);
}

function appendDetail(parent: HTMLElement, label: string, value: string): void {
  if (!label && !value) return;
  const row = document.createElement('div');
  row.className = 'hcmut-cover-detail';
  const labelElement = document.createElement('span');
  labelElement.textContent = label;
  const valueElement = document.createElement('span');
  valueElement.textContent = value;
  row.append(labelElement, valueElement);
  parent.append(row);
}
