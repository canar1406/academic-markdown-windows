import { expect, it } from 'vitest';
import { replaceFrontMatterValue, parseFrontMatter } from '@markdown/document-core';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { exportMarkdownToLatex } from '../src/index.js';
const authoredTheme = {schemaVersion:1,id:'blank-created',version:'1.0.0',name:'Theme mới',scene:{schemaVersion:2,page:{size:'A4',widthMm:210,heightMm:297},tokens:{},variants:{},bindings:[],root:{id:'page',widget:'page',version:1,properties:{},style:{color:'#8A2145',fontSizePt:14},children:[]}}};
it('exports an applied independent theme after a Markdown save/open round trip, without HCMUT assets', () => {
 const source='---\ncustom: keep\n---\n\n# Nội dung thật\n\nBáo cáo của tôi.\n';
 const updated=replaceFrontMatterValue(source,['lmx','authoredTheme'],authoredTheme);
 expect(updated.updated).toBe(true);
 expect(parseFrontMatter(updated.source).body).toBe(parseFrontMatter(source).body);
 const result=exportMarkdownToLatex(updated.source,hcmutReportTheme);
 expect(result.diagnostics.filter(x=>x.severity==='error')).toEqual([]);
 expect(result.latex).toContain('8A2145');
 expect(result.latex).toContain('Nội dung thật');
 expect(result.latex).not.toContain('Images/hcmut.png');
 expect(result.latex).not.toContain('Bách Khoa');
});
it('rejects unsupported authored theme instead of silently exporting HCMUT', () => {
 const source=replaceFrontMatterValue('# Hello\n',['lmx','authoredTheme'],{...authoredTheme,schemaVersion:9}).source;
 const result=exportMarkdownToLatex(source,hcmutReportTheme);
 expect(result.latex).toBe('');
 expect(result.diagnostics.some(x=>x.code==='theme.authored-invalid')).toBe(true);
});
