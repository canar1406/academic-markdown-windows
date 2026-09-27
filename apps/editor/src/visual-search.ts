import type {Muya} from '@markdown/muya-core';
import type Content from '@markdown/muya-core/block/base/content.js';
import { findSearchMatches, replaceSearchMatches, SEARCH_DOCUMENT_LIMIT, SEARCH_MATCH_LIMIT, type SearchMatch } from './search-replace';

export interface VisualMatch extends SearchMatch { block: Content; text: string }
/** Muya block-text search, following MarkText's Content/highlight model.
 * Uses the existing JSON edit operations, flush and history boundaries. */
export class VisualSearchAdapter {
  private highlighted = new Set<Content>();
  constructor(private readonly muya: Muya) {}
  private blocks(): Content[] {
    const result: Content[]=[];
    this.muya.editor.scrollPage?.depthFirstTraverse(node=>{
      if(!node.isContent() || node.blockName==='language-input' || !node.domNode?.isConnected) return;
      let parent=node.parent;
      while(parent) {if(parent.blockName==='frontmatter')return;parent=parent.parent;}
      result.push(node);
    });
    return result;
  }
  find(query:string,matchCase:boolean,wholeWord:boolean): {matches:VisualMatch[];error:string|null} {
    const blocks=this.blocks();
    if(blocks.reduce((n,b)=>n+b.text.length,0)>SEARCH_DOCUMENT_LIMIT)return{matches:[],error:'Document is too large to search.'};
    const matches: VisualMatch[]=[];
    for(const block of blocks){
      const found=findSearchMatches(block.text,query,matchCase,wholeWord);
      if(found.error)return{matches:[],error:found.error};
      matches.push(...found.matches.map(m=>({...m,block,text:block.text})));
      if(matches.length>SEARCH_MATCH_LIMIT)return{matches:[],error:'Too many matches. Refine the search.'};
    }
    return{matches,error:null};
  }
  highlight(matches:VisualMatch[],index:number,reveal=false) {
    this.clear();
    const groups=new Map<Content, Array<{start:number;end:number;active:boolean}>>();
    matches.forEach((m,i)=>{
      const a=groups.get(m.block)??[];a.push({start:m.from,end:m.to,active:i===index});groups.set(m.block,a);
    });
    for(const [block,marks] of groups){if(block.domNode?.isConnected){block.update(undefined,marks);this.highlighted.add(block);}}
    if(reveal)matches[index]?.block.domNode?.scrollIntoView({block:'center',behavior:'instant'});
  }
  clear() {for(const b of this.highlighted){if(b.domNode?.isConnected)b.update();}this.highlighted.clear();}
  focus(match?:VisualMatch) {
    this.clear();
    if(match?.block.domNode?.isConnected && match.block.text===match.text) match.block.setCursor(match.from,match.to,true);
    else this.muya.focus();
  }
  selectionText():string {
    const s=window.getSelection();
    return s?.anchorNode && this.muya.domNode.contains(s.anchorNode)?s.toString():'';
  }
  replace(matches:VisualMatch[],replacement:string): {count:number;error:string|null} {
    this.muya.flushPendingChanges();
    const live=new Set(this.blocks());
    if(matches.some(m=>!live.has(m.block)||m.text!==m.block.text))return{count:0,error:'Search results changed. Search again.'};
    if(matches.length>SEARCH_MATCH_LIMIT)return{count:0,error:'Too many matches.'};
    const groups=new Map<Content,VisualMatch[]>();
    for(const m of matches){const a=groups.get(m.block)??[];a.push(m);groups.set(m.block,a);}
    const edits:Array<{block:Content;text:string}>=[];
    let count=0;
    for(const [block,group] of groups){
      const result=replaceSearchMatches(block.text,group,replacement);
      if(result.error)return{count:0,error:result.error};
      count+=result.count;edits.push({block,text:result.source});
    }
    // Bound aggregate growth as well as individual block operations.
    const total=[...live].reduce((n,b)=>n+b.text.length,0)+edits.reduce((n,e)=>n+e.text.length-e.block.text.length,0);
    if(total>SEARCH_DOCUMENT_LIMIT)return{count:0,error:'Replacement would exceed the document limit.'};
    this.clear();
    this.muya.editor.history.cutoff();
    for(const edit of edits) {edit.block.text=edit.text;edit.block.update();}
    this.muya.flushPendingChanges();
    this.muya.editor.history.cutoff();
    return{count,error:null};
  }
}
