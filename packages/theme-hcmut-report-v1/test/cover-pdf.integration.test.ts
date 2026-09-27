import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hcmutReportTheme } from '../src/index.js';

const root = resolve(import.meta.dirname, '../../..');
const names = [
  'Nguyễn Thị Ánh Nguyệt', 'Trần Hoàng Minh Quân', 'Lê Phạm Thùy Dương',
  'Phạm Nguyễn Bảo Châu', 'Huỳnh Võ Quốc Khánh', 'Võ Đặng Thiên Phúc',
  'Đặng Trần Như Quỳnh', 'Bùi Nguyễn Đức Thịnh', 'Đỗ Lê Khánh Linh',
  'Dương Hoàng Tuấn Kiệt',
];

describe.runIf(process.env.HCMUT_COVER_PDF === '1')('HCMUT actual cover PDF', () => {
  it('keeps ten Vietnamese names and long fields on one bounded A4 cover', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'hcmut-cover-ten-'));
    const students = names.map((name, index) => ({ name, id: `22100${String(index + 1).padStart(2, '0')}` }));
    const latex = hcmutReportTheme.renderDocument('\\section{Nội dung}\nĐoạn văn.\\par', {
      title: 'NGHIÊN CỨU THIẾT KẾ VÀ TRIỂN KHAI HỆ THỐNG SOẠN THẢO BÁO CÁO HỌC THUẬT TIẾNG VIỆT VỚI KHẢ NĂNG BẢO TOÀN DỮ LIỆU',
      faculty: 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH',
      reportType: 'ĐỒ ÁN MÔN HỌC', footerLeft: 'Báo cáo',
      supervisor: 'PGS. TS. Nguyễn Hoàng Minh Đức và TS. Trần Thị Thanh Hương hướng dẫn nghiên cứu ứng dụng',
      secretary: 'ThS. Nguyễn Phạm Hoàng Anh',
      major: 'Khoa học máy tính và kỹ thuật phần mềm phục vụ nghiên cứu học thuật',
      council: 'Hội đồng đánh giá đồ án liên ngành',
      locationDate: 'TP. HỒ CHÍ MINH, THÁNG 09 NĂM 2026',
      students, includeCover: true, includeToc: false, includeListOfFigures: false, includeListOfTables: false,
    });
    mkdirSync(join(workspace, 'Images'));
    cpSync(join(root, 'themes/hcmut-report-v1/assets/hcmut.png'), join(workspace, 'Images/hcmut.png'));
    writeFileSync(join(workspace, 'report.tex'), latex);
    const result = spawnSync(process.env.TECTONIC_BIN!, [
      '--untrusted', '--only-cached', '--bundle',
      join(root, 'apps/macos/Sources/MarkdownMacOS/Resources/TeX/hcmut-offline-v1.ttb'),
      '--keep-logs', '--outdir', workspace, join(workspace, 'report.tex'),
    ], { cwd: workspace, encoding: 'utf8', timeout: 90_000 });
    const log = `${result.stdout}${result.stderr}`;
    console.info(`Cover PDF evidence: ${workspace}`);
    expect(result.status, log).toBe(0);
    const detailedLog = readFileSync(join(workspace, 'report.log'), 'utf8');
    expect(detailedLog).not.toMatch(/Overfull \\[hv]box|Missing character|Font shape .*not available/u);
    const info = spawnSync(process.env.PDFINFO_BIN!, [join(workspace, 'report.pdf')], { encoding: 'utf8' });
    expect(info.status, info.stderr).toBe(0);
    expect(info.stdout).toMatch(/Pages:\s+2/u);
    expect(info.stdout).toContain('(A4)');
    const text = spawnSync(process.env.PDFTOTEXT_BIN!, [
      '-f', '1', '-l', '1', '-layout', join(workspace, 'report.pdf'), '-',
    ], { encoding: 'utf8' });
    expect(text.status, text.stderr).toBe(0);
    const normalized = text.stdout.replace(/\s+/gu, ' ').normalize('NFC');
    for (const student of students) {
      expect(normalized).toContain(student.name);
      expect(normalized).toContain(student.id);
    }
    expect(normalized).toContain('THÁNG 09 NĂM 2026');
    const bbox = spawnSync(process.env.PDFTOTEXT_BIN!, [
      '-f', '1', '-l', '1', '-bbox', join(workspace, 'report.pdf'), '-',
    ], { encoding: 'utf8' });
    expect(bbox.status, bbox.stderr).toBe(0);
    const words = [...bbox.stdout.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/gu)];
    expect(words.length).toBeGreaterThan(100);
    for (const word of words) {
      expect(Number(word[1]), word[0]).toBeGreaterThan(34);
      expect(Number(word[2]), word[0]).toBeGreaterThan(40);
      expect(Number(word[3]), word[0]).toBeLessThan(562);
      expect(Number(word[4]), word[0]).toBeLessThan(802);
    }
  }, 120_000);
});
