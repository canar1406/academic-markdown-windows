// @vitest-environment happy-dom
import {it,expect} from 'vitest';
import {installStudioInteractions,type StudioDrop} from '../src/studio-interactions';
it('shows a drop indicator and sends a reducer command without inserting document text',()=>{
 const root=document.createElement('div');const node=document.createElement('div');node.dataset.authoredNodeId='section';node.dataset.authoredWidget='section';node.textContent='original';root.append(node);
 node.getBoundingClientRect=()=>new DOMRect(0,0,100,100);
 const out:StudioDrop[]=[];const dispose=installStudioInteractions(root,x=>out.push(x));
 const data=new DataTransfer();data.setData('text/plain','studio-widget:text');
 function dispatch(type:string){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{clientY:{value:50},dataTransfer:{value:data}});node.dispatchEvent(e);}
 dispatch('dragover');expect(node.dataset.studioDrop).toBe('inside');
 dispatch('drop');expect(out).toEqual([{value:'studio-widget:text',nodeId:'section',placement:'inside'}]);expect(node.textContent).toBe('original');dispose();
});
