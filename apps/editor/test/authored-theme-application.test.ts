import {expect,it} from 'vitest';
import {parseFrontMatter} from '@markdown/document-core';
import {applyAuthoredThemeToMarkdown} from '../src/authored-theme-application';
const snapshot={schemaVersion:1,id:'my-theme',version:'1.0.0',name:'My theme',scene:{schemaVersion:2,page:{size:'A4',widthMm:210,heightMm:297},tokens:{},variants:{},bindings:[],root:{id:'page',widget:'page',version:1,properties:{},style:{color:'#225577'},children:[]}}};
it('applies a portable snapshot while preserving body and unrelated metadata',()=>{
 const source='---\ncustom: nguyên vẹn\nlmx:\n  cover:\n    title: Tên báo cáo\n---\n\n# Nội dung\n\n$x^2$\n';
 const result=applyAuthoredThemeToMarkdown(source,snapshot);
 expect(result.updated).toBe(true);
 const parsed=parseFrontMatter(result.source);
 expect(parsed.body).toBe(parseFrontMatter(source).body);
 expect(parsed.data.custom).toBe('nguyên vẹn');
 expect(parsed.data.lmx).toMatchObject({cover:{title:'Tên báo cáo'},authoredTheme:snapshot});
});
it('rejects unsupported snapshots and malformed source without modifying either',()=>{
 for(const source of ['# Original','---\nbroken: [\n---\nOriginal']) {
  const result=applyAuthoredThemeToMarkdown(source,{...snapshot,schemaVersion:5});
  expect(result.updated).toBe(false);expect(result.source).toBe(source);
 }
});
