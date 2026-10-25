import type { VisualPageInventoryEntry } from './visual-page-flow';

export const VISUAL_PAGE_ADD_REQUESTED = 'visual-page-add-requested';
export const VISUAL_PAGE_DELETE_REQUESTED = 'visual-page-delete-requested';
export const VISUAL_PAGE_MOVE_REQUESTED = 'visual-page-move-requested';

export interface VisualPageAddRequest {
  afterPageIndex: number;
}

export interface VisualPageDeleteRequest {
  pageIndex: number;
}

export interface VisualPageMoveRequest {
  pageIndex: number;
  direction: 'up' | 'down';
}

/** Adds Canva-style transient page controls without changing canonical Markdown. */
export function installVisualPageActionStrip(editor: HTMLElement): () => void {
  const stage = editor.closest<HTMLElement>('.editor-stage');
  const canvas = editor.closest<HTMLElement>('.editor-zoom-canvas');
  if (!stage || !canvas) return () => undefined;

  const layer = document.createElement('div');
  layer.className = 'visual-page-action-layer';
  layer.contentEditable = 'false';
  canvas.append(layer);

  const synchronizeLayerFrame = (): void => {
    layer.hidden = editor.hidden;
    layer.style.top = `${editor.offsetTop}px`;
    layer.style.left = `${editor.offsetLeft}px`;
    layer.style.width = `${editor.offsetWidth}px`;
    layer.style.height = `${editor.offsetHeight}px`;
    const stageRect = stage.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const scale = editor.offsetWidth > 0 ? editorRect.width / editor.offsetWidth : 1;
    if (stageRect.width > 0 && editorRect.right > stageRect.right + 1) {
      const rightOverflowPx = Math.max(0, (editorRect.right - stageRect.right) / (scale || 1));
      layer.style.setProperty('--visual-action-strip-right-inset', `${Math.round(rightOverflowPx + 12)}px`);
    } else {
      layer.style.setProperty('--visual-action-strip-right-inset', '8px');
    }
  };

  const render = (pages: VisualPageInventoryEntry[]): void => {
    synchronizeLayerFrame();
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    if (!Number.isFinite(pageHeight) || pageHeight <= 0
      || !Number.isFinite(pageGap) || pageGap <= 0) {
      layer.replaceChildren();
      return;
    }

    const slotHeight = pageHeight + pageGap;
    layer.replaceChildren(...pages.map((page) => createPageActionStrip(
      editor,
      page,
      pages,
      page.pageIndex === 0 ? -pageGap : page.pageIndex * slotHeight - pageGap,
      pageGap,
    )));
  };

  const handleInventory = (event: Event): void => {
    const pages = (event as CustomEvent<VisualPageInventoryEntry[]>).detail;
    if (Array.isArray(pages)) render(pages);
  };
  const visibilityObserver = new MutationObserver(synchronizeLayerFrame);
  visibilityObserver.observe(editor, { attributes: true, attributeFilter: ['hidden'] });
  editor.addEventListener('visual-page-inventory-changed', handleInventory);
  stage.addEventListener('scroll', synchronizeLayerFrame, { passive: true });
  window.addEventListener('resize', synchronizeLayerFrame);

  return () => {
    visibilityObserver.disconnect();
    editor.removeEventListener('visual-page-inventory-changed', handleInventory);
    stage.removeEventListener('scroll', synchronizeLayerFrame);
    window.removeEventListener('resize', synchronizeLayerFrame);
    layer.remove();
  };
}

function createPageActionStrip(
  editor: HTMLElement,
  page: VisualPageInventoryEntry,
  pages: VisualPageInventoryEntry[],
  top: number,
  pageGap: number,
): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'visual-page-action-strip';
  strip.dataset.pageIndex = String(page.pageIndex);
  strip.style.top = `${top}px`;
  strip.style.height = `${pageGap}px`;
  strip.title = page.title;

  const label = document.createElement('span');
  label.className = 'visual-page-action-label';
  label.textContent = `Trang ${page.pageIndex + 1}`;
  strip.append(label);

  const actions = document.createElement('span');
  actions.className = 'visual-page-action-buttons';
  const previous = pages[page.pageIndex - 1];
  const next = pages[page.pageIndex + 1];
  const cannotMoveUp = page.pageIndex === 0
    || !page.deletable
    || previous?.deletable === false
    || page.kind === 'blank'
    || previous?.kind === 'blank';
  const cannotMoveDown = page.pageIndex === pages.length - 1
    || !page.deletable
    || (next?.deletable === false && next.kind !== 'blank')
    || page.kind === 'blank';

  actions.append(
    createActionButton('↑', `Di chuyển trang ${page.pageIndex + 1} lên`, () => {
      editor.dispatchEvent(new CustomEvent<VisualPageMoveRequest>(VISUAL_PAGE_MOVE_REQUESTED, {
        detail: { pageIndex: page.pageIndex, direction: 'up' },
      }));
    }, cannotMoveUp),
    createActionButton('↓', `Di chuyển trang ${page.pageIndex + 1} xuống`, () => {
      editor.dispatchEvent(new CustomEvent<VisualPageMoveRequest>(VISUAL_PAGE_MOVE_REQUESTED, {
        detail: { pageIndex: page.pageIndex, direction: 'down' },
      }));
    }, cannotMoveDown),
    createActionButton('+', `Thêm trang sau trang ${page.pageIndex + 1}`, () => {
      editor.dispatchEvent(new CustomEvent<VisualPageAddRequest>(VISUAL_PAGE_ADD_REQUESTED, {
        detail: { afterPageIndex: page.pageIndex },
      }));
    }),
    createActionButton('Xóa', `Xóa trang ${page.pageIndex + 1}`, () => {
      editor.dispatchEvent(new CustomEvent<VisualPageDeleteRequest>(VISUAL_PAGE_DELETE_REQUESTED, {
        detail: { pageIndex: page.pageIndex },
      }));
    }, !page.deletable),
  );
  strip.append(actions);
  return strip;
}

function createActionButton(
  text: string,
  accessibleLabel: string,
  action: () => void,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'visual-page-action-button';
  button.textContent = text;
  button.ariaLabel = accessibleLabel;
  button.disabled = disabled;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return button;
}
