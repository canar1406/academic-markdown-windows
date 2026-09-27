import {
  escapeLatexText,
  renderThemeComponent,
  type LatexTheme,
  type LoadedThemePackage,
  type ThemeDocumentSettings,
  type ThemeStructureBlock,
} from '@markdown/theme-engine';
import { hcmutThemePackage } from './theme-package.js';

export { hcmutLogoUrl, hcmutThemePackage } from './theme-package.js';

export function createHcmutReportTheme(themePackage: LoadedThemePackage): LatexTheme {
  return {
    manifest: themePackage.manifest,
    renderDocument: (body, settings) => renderDocument(themePackage, body, settings),
    renderStructureBlock: (block, settings) => renderStructureBlock(themePackage, block, settings),
    renderBodyStart: () => '\\setcounter{page}{1}\n\n',
    renderComponent: (slot, values) => renderThemeComponent(themePackage, slot, values),
  };
}

export const hcmutReportTheme = createHcmutReportTheme(hcmutThemePackage);

function renderDocument(
  themePackage: LoadedThemePackage,
  body: string,
  settings: ThemeDocumentSettings,
): string {
  const explicit = new Set(settings.explicitStructureBlocks ?? []);
  const placementControlledByMarkdown = settings.explicitStructureBlocks !== undefined;
  const frontMatter = explicit.size === 0 ? renderThemeComponent(themePackage, 'frontmatter', {
    cover: !placementControlledByMarkdown && settings.includeCover
      ? renderCover(themePackage, settings)
      : '',
    toc: !placementControlledByMarkdown && settings.includeToc
      ? renderStructureBlock(themePackage, 'toc', settings)
      : '',
    listOfFigures: !placementControlledByMarkdown && settings.includeListOfFigures
      ? renderStructureBlock(themePackage, 'list-of-figures', settings)
      : '',
    listOfTables: !placementControlledByMarkdown && settings.includeListOfTables
      ? renderStructureBlock(themePackage, 'list-of-tables', settings)
      : '',
  }).trimEnd() : '';

  return `${renderThemeComponent(themePackage, 'document', {
    preamble: preamble(themePackage, settings),
    frontmatter: frontMatter,
    body: body.trimEnd(),
  }).trimEnd()}\n`;
}

function renderStructureBlock(
  themePackage: LoadedThemePackage,
  block: ThemeStructureBlock,
  settings: ThemeDocumentSettings,
): string {
  switch (block) {
    case 'cover':
      return settings.includeCover ? `${renderCover(themePackage, settings)}\n` : '';
    case 'toc':
      return settings.includeToc ? '\\clearpage\n\\tableofcontents\n\\clearpage\n\n' : '';
    case 'list-of-figures':
      return settings.includeListOfFigures ? '\\clearpage\n\\listoffigures\n\\clearpage\n\n' : '';
    case 'list-of-tables':
      return settings.includeListOfTables ? '\\clearpage\n\\listoftables\n\\clearpage\n\n' : '';
  }
}

function preamble(themePackage: LoadedThemePackage, settings: ThemeDocumentSettings): string {
  const headerEnabled = settings.headerEnabled !== false;
  const footerEnabled = settings.footerEnabled !== false;
  const header = headerEnabled ? renderThemeComponent(themePackage, 'header', {
    body: renderHeaderBody(settings),
  }).trimEnd() : '';
  const footer = footerEnabled ? renderThemeComponent(themePackage, 'footer', {
    leftCommand: renderFooterLeft(settings),
    pageNumber: renderPageNumber(settings.footerPageNumber, settings.footerFontSizePt),
  }).trimEnd() : '';
  return renderThemeComponent(themePackage, 'preamble', {
    header,
    footer,
    headRuleWidth: headerEnabled && settings.headerRuleEnabled !== false
      ? `${latexNumber(settings.headerRuleWidthPt ?? 0.3)}pt`
      : '0pt',
    footRuleWidth: footerEnabled && settings.footerRuleEnabled !== false
      ? `${latexNumber(settings.footerRuleWidthPt ?? 0.3)}pt`
      : '0pt',
    tocDepth: String(settings.tocDepth ?? 3),
  }).trimEnd();
}

function renderHeaderBody(settings: ThemeDocumentSettings): string {
  const institution = formatHeaderText(
    renderConstrainedText(
      settings.headerInstitution ?? 'Trường Đại Học Bách Khoa - Đại học Quốc gia TP.HCM',
      12,
      70,
    ),
    settings,
  );
  const faculty = formatHeaderText(
    renderConstrainedText(settings.headerFaculty ?? settings.faculty, 12, 70),
    settings,
  );
  const text = `    \\begin{tabular}{l}\n      ${institution}\\\\\n      ${faculty}\n    \\end{tabular}`;
  if (settings.headerLogoEnabled === false) return `  \\begin{tabular}{l}\n${text}\n  \\end{tabular}`;

  const logoSize = latexNumber(settings.headerLogoSizeMm ?? 10);
  return [
    '  \\begin{tabular}{rl}',
    '    \\begin{picture}(25,15)(0,0)',
    `      \\put(0,-8){\\includegraphics[width=${logoSize}mm, height=${logoSize}mm]{Images/hcmut.png}}`,
    '    \\end{picture}&',
    text,
    '  \\end{tabular}',
  ].join('\n');
}

function formatHeaderText(value: string, settings: ThemeDocumentSettings): string {
  const weighted = settings.headerBold === false ? value : `\\textbf{${value}}`;
  const fontSize = settings.headerFontSizePt ?? 9;
  return fontSize === 9 ? weighted : latexFontSizeGroup(weighted, fontSize);
}

function renderFooterLeft(settings: ThemeDocumentSettings): string {
  const content = renderConstrainedText(settings.footerLeft, 11.5, 110);
  const fontSize = settings.footerFontSizePt ?? 8;
  const formatted = fontSize === 8 ? `\\scriptsize ${content}` : latexFontSizeGroup(content, fontSize);
  return `\\fancyfoot[L]{${formatted}}`;
}

function renderPageNumber(
  value: ThemeDocumentSettings['footerPageNumber'],
  fontSizeValue: number | undefined,
): string {
  const fontSize = fontSizeValue ?? 8;
  const format = (content: string): string => (
    fontSize === 8 ? `\\scriptsize ${content}` : latexFontSizeGroup(content, fontSize)
  );
  switch (value ?? 'current-total') {
    case 'current-total':
      return `\\fancyfoot[R]{${format('Trang {\\thepage}/\\pageref{LastPage}')}}`;
    case 'current':
      return `\\fancyfoot[R]{${format('Trang {\\thepage}')}}`;
    case 'none':
      return '';
  }
}

function renderCover(themePackage: LoadedThemePackage, settings: ThemeDocumentSettings): string {
  if ((settings.students?.length ?? 0) > 10) {
    throw new Error('HCMUT cover supports at most 10 students; no entries were discarded.');
  }
  const studentDetails = (settings.students ?? []).map((student, index) => ({
    label: `SVTH${index + 1}`,
    value: `${student.name} (${student.id})`,
  }));
  const detailRows = [
    { label: 'HỘI ĐỒNG', value: settings.council ?? '' },
    { label: 'GVHD', value: settings.supervisor ?? '' },
    { label: 'TKHĐ', value: settings.secretary ?? '' },
  ].filter(({ value }) => value.trim().length > 0);
  const usesFlexibleCoverTable = studentDetails.length > 3
    || [...detailRows, ...studentDetails].some(({ value }) => needsConstrainedText(value, 48));
  const compact = studentDetails.length > 3
    || [settings.title, settings.faculty, settings.university ?? '', settings.school ?? '',
      settings.reportType, settings.major ?? '', settings.coverHeading ?? '',
      settings.locationDate ?? ''].some(value => needsConstrainedText(value, 70));
  const students = studentDetails
    .map(({ label, value }) => `\\hspace{6cm} & \\textbf{\\Large ${label}:} & {\\Large ${escapeLatexText(value)}} \\\\[0.28cm]`)
    .join('\n');
  const coverRows = [
    ...detailRows.map(({ label, value }) => `\\hspace{6cm} & \\textbf{\\Large ${label}:} & {\\Large ${escapeLatexText(value)}} \\\\[0.28cm]`),
    '\\hspace{6cm} & \\multicolumn{2}{c}{\\textbf{\\Large ---o0o---}} \\\\[0.28cm]',
    students,
  ].filter(Boolean).join('\n');
  const flexibleCoverRows = [
    ...detailRows.map(({ label, value }) => `\\textbf{\\Large ${label}:} & {\\Large ${escapeWithBreaksInLongRuns(value)}} \\\\[0.28cm]`),
    '\\multicolumn{2}{c}{\\textbf{\\Large ---o0o---}} \\\\[0.28cm]',
    ...studentDetails.map(({ label, value }) => `\\textbf{\\Large ${label}:} & {\\Large ${escapeWithBreaksInLongRuns(value)}} \\\\[0.28cm]`),
  ].join('\n');
  const coverTable = compact
    ? renderCompactCoverTable(detailRows, studentDetails)
    : usesFlexibleCoverTable
    ? `\\begin{tabularx}{\\textwidth}{@{\\hspace{6cm}}l >{\\raggedright\\arraybackslash}X@{}}\n${flexibleCoverRows}\n\\end{tabularx}`
    : `\\begin{tabular}{rll}\n${coverRows}\n\\end{tabular}`;
  const coverText = (value: string): string => compact ? escapeWithBreaksInLongRuns(value) : escapeLatexText(value);
  const rendered = renderThemeComponent(themePackage, 'cover', {
    border: settings.coverBorderEnabled === false ? '' : [
      '\\begin{tikzpicture}[remember picture,overlay]',
      `  \\draw[line width=${latexNumber(settings.coverOuterBorderWidthPt ?? 4)}pt] ($(current page.north west)+(0.4in,-0.5in)$) rectangle ($(current page.south east)+(-0.4in,0.5in)$);`,
      `  \\draw[line width=${latexNumber(settings.coverInnerBorderWidthPt ?? 1.5)}pt] ($(current page.north west)+(0.45in,-0.55in)$) rectangle ($(current page.south east)+(-0.45in,0.55in)$);`,
      '\\end{tikzpicture}',
    ].join('\n'),
    university: coverText(settings.university ?? 'ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH'),
    school: coverText(settings.school ?? 'TRƯỜNG ĐẠI HỌC BÁCH KHOA'),
    faculty: coverText(settings.faculty),
    logo: settings.coverLogoEnabled === false
      ? ''
      : `\\includegraphics[width=${latexNumber(settings.coverLogoWidthCm ?? 4)}cm]{Images/hcmut.png}\\par`,
    heading: coverText(settings.coverHeading ?? 'BÁO CÁO'),
    reportType: coverText(settings.reportType),
    title: coverText(settings.title),
    major: settings.major ? coverText(settings.major) : '',
    coverTable,
    locationDate: coverText(settings.locationDate ?? 'TP. HỒ CHÍ MINH'),
  }).trimEnd();
  if (!compact) return rendered;

  // Keep the versioned cover template (including its border) authoritative.
  // Only dense covers measure its content in a local box, shrinking if needed;
  // the ordinary 1–3-student reference output is byte-for-byte unchanged.
  return rendered.replace('\\begin{center}', [
    '\\par\\begingroup',
    '\\newsavebox{\\hcmutcoverbox}',
    '\\begin{lrbox}{\\hcmutcoverbox}\\begin{minipage}{\\textwidth}',
    '\\begin{center}',
  ].join('\n')).replace('\\end{center}', [
    '\\end{center}',
    '\\end{minipage}\\end{lrbox}',
    '\\noindent\\makebox[\\textwidth][c]{%',
    '\\ifdim\\dimexpr\\ht\\hcmutcoverbox+\\dp\\hcmutcoverbox\\relax>0.92\\textheight',
    '  \\resizebox*{!}{0.92\\textheight}{\\usebox{\\hcmutcoverbox}}%',
    '\\else\\usebox{\\hcmutcoverbox}\\fi}',
    '\\endgroup',
  ].join('\n'));
}

function renderCompactCoverTable(
  details: Array<{ label: string; value: string }>,
  students: Array<{ label: string; value: string }>,
): string {
  const cell = ({ label, value }: { label: string; value: string }): string => (
    `\\textbf{${label}:} ${escapeWithBreaksInLongRuns(value)}`
  );
  const studentRows: string[] = [];
  for (let index = 0; index < students.length; index += 2) {
    studentRows.push(`${cell(students[index]!)} & ${students[index + 1] ? cell(students[index + 1]!) : ''} \\\\[0.12cm]`);
  }
  const fontSize = students.length <= 6 ? 14 : 12;
  return [
    `{\\fontsize{${fontSize}pt}{${fontSize * 1.25}pt}\\selectfont`,
    ...details.map(row => `\\noindent ${cell(row)}\\par\\smallskip`),
    '\\medskip\\textbf{---o0o---}\\par\\medskip',
    '\\begin{tabularx}{\\textwidth}{@{}>{\\raggedright\\arraybackslash}X@{\\hspace{0.5cm}}>{\\raggedright\\arraybackslash}X@{}}',
    ...studentRows,
    '\\end{tabularx}}',
  ].join('\n');
}

function renderConstrainedText(value: string, widthCm: number, lengthThreshold: number): string {
  const escaped = escapeWithBreaksInLongRuns(value);
  return needsConstrainedText(value, lengthThreshold)
    ? `\\parbox[t]{${latexNumber(widthCm)}cm}{\\raggedright ${escaped}}`
    : escaped;
}

function needsConstrainedText(value: string, lengthThreshold: number): boolean {
  return value.length > lengthThreshold || /\S{24,}/u.test(value);
}

function escapeWithBreaksInLongRuns(value: string): string {
  return value.split(/(\s+)/u).map((run) => {
    const characters = Array.from(run);
    if (/^\s+$/u.test(run) || characters.length < 17) return escapeLatexText(run);

    const chunks: string[] = [];
    for (let index = 0; index < characters.length; index += 16) {
      chunks.push(escapeLatexText(characters.slice(index, index + 16).join('')));
    }
    return chunks.join('\\allowbreak{}');
  }).join('');
}

function latexFontSizeGroup(content: string, fontSize: number): string {
  return `{\\fontsize{${latexNumber(fontSize)}pt}{${latexNumber(fontSize * 1.2)}pt}\\selectfont ${content}}`;
}

function latexNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}
