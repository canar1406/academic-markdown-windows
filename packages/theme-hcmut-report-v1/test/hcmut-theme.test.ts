import { describe, expect, it } from 'vitest';
import { resolveThemeComponent } from '@markdown/theme-engine';
import {
  createHcmutReportTheme,
  hcmutLogoUrl,
  hcmutReportTheme,
  hcmutThemePackage,
} from '../src/index.js';

const expectedComponentSlots = [
  'document',
  'preamble',
  'cover',
  'header',
  'footer',
  'frontmatter',
  'front-section',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'figure',
  'table',
  'listing',
  'theorem',
  'property',
  'proposition',
  'corollary',
  'lemma',
  'exercise',
  'page-break',
];

describe('HCMUT report theme v1', () => {
  it.each([0, 1, 3, 4, 6, 7, 10])('retains every author at supported count %i', (count) => {
    const latex = hcmutReportTheme.renderStructureBlock?.('cover', {
      title: 'Báo cáo', faculty: 'Khoa', reportType: 'Đồ án', footerLeft: '',
      includeCover: true, includeToc: false, includeListOfFigures: false,
      includeListOfTables: false,
      students: Array.from({ length: count }, (_, index) => ({ name: `Nguyễn Ánh ${index}`, id: `${index}` })),
    }) ?? '';
    expect(latex.match(/SVTH\d+:/gu) ?? []).toHaveLength(count);
    if (count > 3) {
      expect(latex).toContain(count <= 6 ? '\\fontsize{14pt}{17.5pt}' : '\\fontsize{12pt}{15pt}');
    } else {
      expect(latex).not.toContain('hcmutcoverbox');
    }
  });

  it('renders ten students without truncation using compact two-column rows', () => {
    const students = Array.from({ length: 10 }, (_, index) => ({
      name: `Nguyễn Thị Ánh ${index + 1}`, id: `00${index + 1}`,
    }));
    const latex = hcmutReportTheme.renderStructureBlock?.('cover', {
      title: 'Báo cáo', faculty: 'Khoa', reportType: 'Đồ án', footerLeft: '',
      includeCover: true, includeToc: false, includeListOfFigures: false,
      includeListOfTables: false, students,
    });
    for (const student of students) expect(latex).toContain(`${student.name} (${student.id})`);
    expect(latex).toContain('SVTH10:');
    expect(latex).toContain('\\begin{tabularx}{\\textwidth}{@{}');
    expect(latex).not.toContain('\\hspace{6cm}');
  });

  it('rejects an unsupported cover count explicitly rather than exporting a truncated list', () => {
    expect(() => hcmutReportTheme.renderStructureBlock?.('cover', {
      title: 'Báo cáo', faculty: 'Khoa', reportType: 'Đồ án', footerLeft: '',
      includeCover: true, includeToc: false, includeListOfFigures: false,
      includeListOfTables: false,
      students: Array.from({ length: 11 }, () => ({ name: 'Nguyễn Ánh', id: '01' })),
    })).toThrow(/10 students/);
  });

  it('loads the normalized versioned manifest and every addressable component slot', () => {
    expect(hcmutThemePackage.manifest.id).toBe('hcmut-report-v1');
    expect(hcmutThemePackage.manifest.version).toBe('1.0.0-beta.1');
    expect(Object.keys(hcmutThemePackage.manifest.components).sort())
      .toEqual([...expectedComponentSlots].sort());

    for (const slot of expectedComponentSlots) {
      expect(resolveThemeComponent(hcmutThemePackage, slot), slot).toBeDefined();
    }
    expect(resolveThemeComponent(hcmutThemePackage, 'heading-4')?.source)
      .toContain('\\subsubsubsection');
  });

  it('exposes the bundled logo as a renderer-safe PNG data URL', () => {
    expect(hcmutLogoUrl).toMatch(/^data:image\/png;base64,/);
    expect(hcmutThemePackage.resources['assets/hcmut.png']).toBe(hcmutLogoUrl);
  });

  it('renders generated front matter through the package component resource', () => {
    const frontmatterPath = hcmutThemePackage.manifest.components.frontmatter;
    const theme = createHcmutReportTheme({
      manifest: hcmutThemePackage.manifest,
      resources: {
        ...hcmutThemePackage.resources,
        [frontmatterPath]: 'THEME-FRONTMATTER[{{{cover}}}|{{{toc}}}|{{{listOfFigures}}}|{{{listOfTables}}}]',
      },
    });

    const latex = theme.renderDocument('BODY\n', {
      title: 'Đề tài',
      faculty: 'Khoa',
      reportType: 'Báo cáo',
      footerLeft: 'Footer',
      includeCover: false,
      includeToc: true,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('THEME-FRONTMATTER[|\\clearpage\n\\tableofcontents');
  });

  it('keeps the reference geometry, page chrome, cover, and level-four heading', () => {
    const latex = hcmutReportTheme.renderDocument('\\section{Nội dung}\n', {
      title: 'Hệ thống mẫu',
      faculty: 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH',
      reportType: 'ĐỒ ÁN MÔN HỌC',
      footerLeft: 'Báo cáo học kỳ',
      includeCover: true,
      includeToc: true,
      includeListOfFigures: true,
      includeListOfTables: true,
    });

    expect(latex).toContain('left=30mm');
    expect(latex).toContain('right=20mm');
    expect(latex).toContain('\\includegraphics[width=10mm, height=10mm]{Images/hcmut.png}');
    expect(latex).not.toContain('\\fancyhfoffset');
    expect(latex).toContain('\\fancyhead[L]{');
    expect(latex).toContain('\\fancyfoot[L]{\\scriptsize Báo cáo học kỳ}');
    expect(latex).toContain('Trường Đại Học Bách Khoa - Đại học Quốc gia TP.HCM');
    expect(latex).toContain(
      '\\fancyfoot[R]{\\scriptsize Trang {\\thepage}/\\pageref{LastPage}}',
    );
    expect(latex).toContain('Báo cáo học kỳ');
    expect(latex).toContain('\\newcommand\\subsubsubsection');
    expect(latex).toContain('Hệ thống mẫu');
    expect(latex.indexOf('\\usepackage{mathptmx}')).toBeLessThan(
      latex.indexOf('\\setmainfont{Times New Roman}'),
    );
    expect(latex).toContain('\\usepackage[normalem]{ulem}');
    expect(latex).toContain('language=R');
    expect(latex).toContain('escapeinside={}');
    expect(latex.indexOf('{\\LARGE\\bfseries BÁO CÁO\\par}')).toBeLessThan(
      latex.indexOf('{\\LARGE\\bfseries ĐỒ ÁN MÔN HỌC\\par}'),
    );
    expect(latex).toContain('\\includegraphics[width=4cm]{Images/hcmut.png}\\par');
    expect(latex).toContain('\\tableofcontents');
    expect(latex).toContain('\\addtocontents{toc}{\\protect\\thispagestyle{empty}}');
    expect(latex).toContain('\\renewcommand{\\footruleskip}{1mm}');
    expect(latex).not.toContain('\\setlength{\\footruleskip}{1mm}');
  });

  it('forces every generated list onto a complete page in exported TeX', () => {
    const settings = {
      title: 'Đề tài',
      faculty: 'Khoa',
      reportType: 'Báo cáo',
      footerLeft: 'Footer',
      includeCover: false,
      includeToc: true,
      includeListOfFigures: true,
      includeListOfTables: true,
    };

    expect(hcmutReportTheme.renderStructureBlock?.('toc', settings))
      .toBe('\\clearpage\n\\tableofcontents\n\\clearpage\n\n');
    expect(hcmutReportTheme.renderStructureBlock?.('list-of-figures', settings))
      .toBe('\\clearpage\n\\listoffigures\n\\clearpage\n\n');
    expect(hcmutReportTheme.renderStructureBlock?.('list-of-tables', settings))
      .toBe('\\clearpage\n\\listoftables\n\\clearpage\n\n');
  });

  it('reserves bottom space so a three-student cover date stays inside the A4 border', () => {
    const latex = hcmutReportTheme.renderDocument('', {
      title: 'Đề tài',
      faculty: 'Khoa',
      reportType: 'Báo cáo',
      footerLeft: 'Footer',
      students: [
        { name: 'Sinh viên A', id: '1' },
        { name: 'Sinh viên B', id: '2' },
        { name: 'Sinh viên C', id: '3' },
      ],
      locationDate: 'TP. HỒ CHÍ MINH, 2026',
      includeCover: true,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('SVTH3:');
    expect(latex).toContain(
      '{\\Large TP. HỒ CHÍ MINH, 2026\\par}\n\\vspace*{1.2cm}\n\\end{center}',
    );
  });

  it('renders all six Lammerkas members on the cover', () => {
    const students = [
      'Huỳnh Ngọc Thịnh',
      'Dương Minh Tài',
      'Hoàng Đăng',
      'Nguyễn Tuấn Kiệt',
      'Trần Khang',
      'Võ Nguyễn Hoàng Long',
    ].map((name, index) => ({ name, id: index === 0 ? 'TRƯỞNG NHÓM' : 'THÀNH VIÊN' }));
    const latex = hcmutReportTheme.renderDocument('', {
      title: 'Academic Markdown',
      faculty: 'LAMMERKAS',
      reportType: 'Báo cáo kỹ thuật',
      footerLeft: 'Academic Markdown',
      students,
      includeCover: true,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('SVTH6:');
    expect(latex).not.toContain('TKHĐ:');
    expect(latex).toContain('\\begin{tabularx}{\\textwidth}');
    for (const student of students) {
      expect(latex).toContain(student.name);
    }
  });

  it('honors Properties overrides for cover, header, footer, numbering, and TOC depth', () => {
    const latex = hcmutReportTheme.renderDocument('\\section{Nội dung}\n', {
      title: 'Đề tài',
      university: 'ĐẠI HỌC TÙY CHỈNH',
      school: 'TRƯỜNG TÙY CHỈNH',
      faculty: 'KHOA TÙY CHỈNH',
      reportType: 'BÁO CÁO TÙY CHỈNH',
      footerLeft: 'Không được hiện',
      footerEnabled: false,
      footerPageNumber: 'none',
      headerEnabled: false,
      headerInstitution: 'Không được hiện',
      headerFaculty: 'Không được hiện',
      tocDepth: 1,
      includeCover: true,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('ĐẠI HỌC TÙY CHỈNH');
    expect(latex).toContain('TRƯỜNG TÙY CHỈNH');
    expect(latex).not.toContain('Không được hiện');
    expect(latex).toContain('\\setcounter{tocdepth}{1}');
    expect(latex).toContain('\\renewcommand{\\headrulewidth}{0pt}');
    expect(latex).toContain('\\renewcommand{\\footrulewidth}{0pt}');
  });

  it('maps detailed cover, header, and footer appearance settings into TeX', () => {
    const latex = hcmutReportTheme.renderDocument('\\section{Nội dung}\n', {
      title: 'Đề tài',
      faculty: 'KHOA TÙY CHỈNH',
      reportType: 'BÁO CÁO TÙY CHỈNH',
      footerLeft: 'CHÂN TRANG TÙY CHỈNH',
      coverHeading: 'TIÊU ĐỀ BÌA TÙY CHỈNH',
      coverLogoEnabled: false,
      coverBorderEnabled: false,
      headerInstitution: 'ĐƠN VỊ TÙY CHỈNH',
      headerFaculty: 'KHOA HEADER TÙY CHỈNH',
      headerLogoEnabled: false,
      headerFontSizePt: 8.5,
      headerBold: false,
      headerRuleEnabled: false,
      headerRuleWidthPt: 0.6,
      footerFontSizePt: 9,
      footerRuleEnabled: true,
      footerRuleWidthPt: 0.5,
      includeCover: true,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('{\\LARGE\\bfseries TIÊU ĐỀ BÌA TÙY CHỈNH\\par}');
    expect(latex).not.toContain('\\draw[line width=');
    expect(latex).not.toContain('\\includegraphics');
    expect(latex).toContain('{\\fontsize{8.5pt}{10.2pt}\\selectfont ĐƠN VỊ TÙY CHỈNH}');
    expect(latex).toContain('{\\fontsize{8.5pt}{10.2pt}\\selectfont KHOA HEADER TÙY CHỈNH}');
    expect(latex).toContain('\\fancyfoot[L]{{\\fontsize{9pt}{10.8pt}\\selectfont CHÂN TRANG TÙY CHỈNH}}');
    expect(latex).toContain('\\renewcommand{\\headrulewidth}{0pt}');
    expect(latex).toContain('\\renewcommand{\\footrulewidth}{0.5pt}');
  });

  it('maps configurable logo and cover border dimensions into TeX', () => {
    const latex = hcmutReportTheme.renderDocument('', {
      title: 'Đề tài',
      faculty: 'Khoa',
      reportType: 'Báo cáo',
      footerLeft: 'Footer',
      coverLogoWidthCm: 3.5,
      coverOuterBorderWidthPt: 3.25,
      coverInnerBorderWidthPt: 1.25,
      headerLogoSizeMm: 8,
      includeCover: true,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('\\draw[line width=3.25pt]');
    expect(latex).toContain('\\draw[line width=1.25pt]');
    expect(latex).toContain('\\includegraphics[width=3.5cm]{Images/hcmut.png}\\par');
    expect(latex).toContain('\\includegraphics[width=8mm, height=8mm]{Images/hcmut.png}');
  });

  it('wraps long cover detail text without changing the normal short-row output', () => {
    const longSupervisor = 'x'.repeat(100);
    const latex = hcmutReportTheme.renderDocument('', {
      title: 'Đề tài',
      faculty: 'Khoa',
      reportType: 'Báo cáo',
      supervisor: longSupervisor,
      footerLeft: 'Footer',
      includeCover: true,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('\\begin{tabularx}{\\textwidth}');
    expect(latex).toContain('\\allowbreak{}');
    expect(latex).not.toContain('HỘI ĐỒNG:');
    expect(latex).not.toContain('TKHĐ:');
    expect(latex).not.toContain('\\begin{tabular}{rll}');
  });

  it('wraps long header and footer values in fixed-width TeX boxes', () => {
    const latex = hcmutReportTheme.renderDocument('Nội dung', {
      title: 'Đề tài',
      faculty: 'Khoa',
      reportType: 'Báo cáo',
      headerInstitution: 'H'.repeat(140),
      headerFaculty: 'Khoa',
      footerLeft: 'F'.repeat(200),
      includeCover: false,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('\\parbox[t]{12cm}{\\raggedright');
    expect(latex).toContain('\\parbox[t]{11.5cm}{\\raggedright');
    expect(latex).toContain('\\allowbreak{}');
  });

  it('uses explicit A4 margins without an over-specified total and reserves footer space', () => {
    const latex = hcmutReportTheme.renderDocument('Nội dung', {
      title: 'Đề tài',
      faculty: 'Khoa',
      reportType: 'Báo cáo',
      footerLeft: 'Footer',
      includeCover: false,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain(
      '\\geometry{a4paper,left=30mm,top=22mm,right=20mm,bottom=20mm}',
    );
    expect(latex).not.toContain('total={160mm,240mm}');
    expect(latex).toContain('\\setlength{\\footskip}{24pt}');
  });

  it('does not emit undefined Times bold shapes in the TeX preamble', () => {
    const latex = hcmutReportTheme.renderDocument('Nội dung', {
      title: 'Đề tài',
      faculty: 'Khoa',
      reportType: 'Báo cáo',
      footerLeft: 'Footer',
      includeCover: false,
      includeToc: false,
      includeListOfFigures: false,
      includeListOfTables: false,
    });

    expect(latex).toContain('\\DeclareSymbolFont{bold}{OT1}{ptm}{b}{n}');
    expect(latex).toContain('\\DeclareMathAlphabet{\\mathbf}{OT1}{ptm}{b}{n}');
  });
});
