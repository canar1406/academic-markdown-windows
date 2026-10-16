export interface StudioDrop { value: string; nodeId: string; placement: 'inside'|'before'|'after' }
/** Delegated builder interactions. Scene data only changes via native reducer. */
export function installStudioInteractions(root: HTMLElement, send: (drop: StudioDrop)=>void): ()=>void {
  let active: HTMLElement|null=null;
  const clear=()=>{active?.removeAttribute('data-studio-drop');active=null;};
  const target=(e: DragEvent)=>{
    if(!(e.target instanceof Element))return null;
    const element=e.target.closest<HTMLElement>('[data-authored-node-id]');
    if(!element||!root.contains(element))return null;
    const rect=element.getBoundingClientRect();
    const kind=element.dataset.authoredWidget;
    const container=['page','section','row','column','stack','body','cover','header','footer'].includes(kind??'');
    const position=(e.clientY-rect.top)/Math.max(1,rect.height);
    const placement=element===root?'inside':container&&position>.2&&position<.8?'inside':position<.5?'before':'after';
    return {element,placement} as const;
  };
  const over=(e:DragEvent)=>{
    const next=target(e);if(!next)return;
    if(![...(e.dataTransfer?.types??[])].includes('text/plain'))return;
    e.preventDefault();e.stopImmediatePropagation();clear();active=next.element;
    active.dataset.studioDrop=next.placement;
  };
  const drop=(e:DragEvent)=>{
    const next=target(e);clear();if(!next)return;
    const value=e.dataTransfer?.getData('text/plain')??'';
    if(!/^studio-(?:widget|node):[A-Za-z0-9_.-]{1,200}$/.test(value))return;
    e.preventDefault();e.stopImmediatePropagation();
    send({value,nodeId:next.element.dataset.authoredNodeId!,placement:next.placement});
  };
  const start=(e:DragEvent)=>{
    if(!(e.target instanceof HTMLElement)||!e.target.matches('[data-studio-drag-handle]'))return;
    const node=e.target.closest<HTMLElement>('[data-authored-node-id]');if(!node)return;
    e.dataTransfer?.setData('text/plain',`studio-node:${node.dataset.authoredNodeId}`);
    e.stopPropagation();
  };
  root.addEventListener('dragover',over,true);root.addEventListener('drop',drop,true);root.addEventListener('dragstart',start,true);root.addEventListener('dragend',clear,true);
  return()=>{clear();root.removeEventListener('dragover',over,true);root.removeEventListener('drop',drop,true);root.removeEventListener('dragstart',start,true);root.removeEventListener('dragend',clear,true);};
}
