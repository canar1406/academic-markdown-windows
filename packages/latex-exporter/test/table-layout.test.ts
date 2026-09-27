import { describe, it, expect } from 'vitest';
import { exportMarkdownToLatex } from '../src/index.js';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';

const table = '| Thành viên | Vai trò | Trách nhiệm |\n| :--- | :---: | ---: |\n| Nguyễn Bá Hoàng Đăng | Kỹ sư | Kiểm tra nội dung dài, bảo toàn tiếng Việt và các ký tự & % |';

describe('width-bounded PDF tables', () => {
  it('wraps plain tables in bounded paragraph columns and repeats their header across pages', () => {
    const result = exportMarkdownToLatex(table, hcmutReportTheme);
    expect(result.diagnostics.filter(x => x.severity === 'error')).toEqual([]);
    expect(result.latex).toContain('\\begin{longtable}');
    expect(result.latex).toContain('\\linewidth-6\\tabcolsep');
    expect(result.latex).toContain('\\centering\\arraybackslash');
    expect(result.latex).toContain('\\raggedleft\\arraybackslash');
    expect(result.latex).toContain('\\endfirsthead');
    expect(result.latex).toContain('\\endhead');
    expect(result.latex).toContain('Nguyễn Bá Hoàng Đăng');
    expect(result.latex).toContain('\\& \\%');
  });

  it('uses tabularx inside a captioned floating table instead of nesting longtable inside a float', () => {
    const result = exportMarkdownToLatex(`:::table {#tbl-people caption="Nhân sự"}\n${table}\n:::`, hcmutReportTheme);
    expect(result.latex).toContain('\\begin{tabularx}{\\linewidth}');
    expect(result.latex).not.toContain('\\begin{longtable}');
    expect(result.latex).toContain('\\caption{Nhân sự}');
    expect(result.latex).toContain('\\label{tbl-people}');
  });

  it('uses width-bounded tables in boxed styles and list containers', () => {
    const styled = exportMarkdownToLatex(`:::style {background="#FFFFFF" paddingMm=2}\n${table}\n:::`, hcmutReportTheme);
    expect(styled.latex).toContain('\\begin{tabularx}{\\linewidth}');
    expect(styled.latex).not.toContain('\\begin{longtable}');
    const quote = exportMarkdownToLatex(table.split('\n').map(l => '> ' + l).join('\n'), hcmutReportTheme);
    expect(quote.latex).toContain('\\begin{tabularx}{\\linewidth}');
  });
});
