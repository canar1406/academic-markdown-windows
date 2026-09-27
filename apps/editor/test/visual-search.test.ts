// @vitest-environment happy-dom
import {it,expect} from 'vitest';
import {Muya} from '@markdown/muya-core';
import {VisualSearchAdapter} from '../src/visual-search';
it('searches live blocks, excludes YAML, and replaces all in one isolated undo step',()=>{
 const host=document.createElement('div');document.body.append(host);
 const muya=new Muya(host,{frontMatter:true});muya.init();
 try {
  muya.setContent('---\ntitle: Toán\n---\n\n# Toán\n\nToán học\n\n| A | B |\n| --- | --- |\n| Toán | Toán |\n');
  const adapter=new VisualSearchAdapter(muya);
  const before=muya.getMarkdown();const results=adapter.find('Toán',true,false);
  expect(results.matches).toHaveLength(4);
  const replace=adapter.replace(results.matches,'Giải tích');expect(replace.error).toBeNull();
  expect(muya.getMarkdown()).toContain('title: Toán');
  expect(adapter.find('Giải tích',true,false).matches).toHaveLength(4);
  muya.undo();expect(muya.getMarkdown()).toBe(before);
  muya.redo();expect(adapter.find('Giải tích',true,false).matches).toHaveLength(4);
  adapter.clear();
 }finally{muya.destroy();host.remove();}
});
it('refuses stale matches after loading another document',()=>{
 const host=document.createElement('div');document.body.append(host);const muya=new Muya(host);muya.init();
 try{muya.setContent('Old target');const adapter=new VisualSearchAdapter(muya);const hits=adapter.find('target',true,false);muya.setContent('New target');expect(adapter.replace(hits.matches,'WRONG').error).not.toBeNull();expect(muya.getMarkdown()).toBe('New target\n');}finally{muya.destroy();host.remove();}
});
