// @vitest-environment happy-dom
import {expect,it} from 'vitest';
import {installBridge} from '../src/bridge';
import {createEnvelope,type BridgeEnvelope} from '@markdown/bridge-protocol';
it('clicking a cover node selects it through correlated bridge without changing source',()=>{
 const host=document.createElement('section');document.body.append(host);let source='';
 const messages:BridgeEnvelope[]=[];
 window.webkit={messageHandlers:{bridge:{postMessage:m=>messages.push(m)}}};
 installBridge({setContent:s=>{source=s;host.innerHTML='<div data-authored-node-id="cover"><div data-authored-node-id="text">Text</div></div>';},getMarkdown:()=>source,on:()=>{},visualContainer:host});
 try{
 const scene={schemaVersion:2,page:{size:'A4',widthMm:210,heightMm:297},tokens:{},variants:{},bindings:[],root:{id:'page',widget:'page',version:1,properties:{},style:{},children:[]}};
 window.markdownEditor?.handleEnvelope(createEnvelope('studio.previewScene','scene1',{scene}));
 const before=source;
 host.querySelector<HTMLElement>('[data-authored-node-id="text"]')!.click();
 expect(messages.at(-1)).toMatchObject({type:'studio.nodeSelected',requestId:'scene1',payload:{nodeId:'text'}});
 expect(source).toBe(before);
 window.markdownEditor?.handleEnvelope(createEnvelope('studio.selectNode','scene1',{nodeId:'cover'}));
 expect(host.querySelector('[data-authored-node-id="cover"]')?.getAttribute('data-authored-selected')).toBe('true');
 window.markdownEditor?.handleEnvelope(createEnvelope('studio.selectNode','old-scene',{nodeId:'text'}));
 expect(host.querySelector('[data-authored-node-id="cover"]')?.getAttribute('data-authored-selected')).toBe('true');
 }finally{window.dispatchEvent(new Event('pagehide'));host.remove();delete window.webkit;delete window.markdownEditor;}
});
