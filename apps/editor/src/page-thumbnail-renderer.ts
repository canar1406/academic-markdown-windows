import { toSvg } from 'html-to-image';
import { VISUAL_ZOOM_INTERACTION_CHANGED } from './editor-canvas-zoom';
import {
  VISUAL_PAGE_LAYOUT_COMMITTED,
  type VisualPageInventoryEntry,
} from './visual-page-flow';

const DEFAULT_THUMBNAIL_WIDTH = 128;
const RENDER_DEBOUNCE_MS = 320;

export interface VisualPageThumbnail {
  layoutRevision: number;
  pageIndex: number;
  targetWidth: number;
  mimeType: 'image/jpeg';
  dataBase64: string;
}

export interface VisualPageThumbnailFailure {
  layoutRevision: number;
  pageIndex: number;
  targetWidth: number;
  message: string;
}

/** Rasterizes the live Visual DOM into transient, low-resolution A4 cards. */
export function installVisualPageThumbnailRenderer(editor: HTMLElement): () => void {
  let timer: number | null = null;
  let generation = 0;
  let enabled = false;
  let suspended = false;
  let contentDirty = false;
  let renderPending = false;
  let rendering = false;
  let disposed = false;
  let targetWidth = DEFAULT_THUMBNAIL_WIDTH;
  let demandedPageIndices = new Set<number>();
  let latestPages: VisualPageInventoryEntry[] = [];

  const demandedPages = (): VisualPageInventoryEntry[] => (
    latestPages.filter((page) => demandedPageIndices.has(page.pageIndex))
  );

  const schedule = (pages: VisualPageInventoryEntry[]): void => {
    latestPages = pages;
    generation += 1;
    renderPending = true;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (disposed || !enabled || suspended || rendering) return;

    const scheduledGeneration = generation;
    const scheduledPages = demandedPages();
    const scheduledWidth = targetWidth;
    timer = window.setTimeout(() => {
      timer = null;
      renderPending = false;
      rendering = true;
      void renderPages(editor, scheduledPages, scheduledWidth, scheduledGeneration, () => generation)
        .catch((error: unknown) => {
          console.warn('[DEBUG-thumbnail] render failed', error);
          // A broken document asset must not surface as an unhandled editor error.
          // Individual page failures are emitted by renderPages so the native
          // navigator can leave "Loading" and offer a retry.
        })
        .finally(() => {
          rendering = false;
          if (renderPending && enabled && !suspended && !disposed) schedule(latestPages);
        });
    }, RENDER_DEBOUNCE_MS);
  };

  const handleInventory = (event: Event): void => {
    const pages = (event as CustomEvent<VisualPageInventoryEntry[]>).detail;
    if (Array.isArray(pages)) schedule(pages);
  };
  const handleContentChange = (): void => {
    contentDirty = true;
  };
  const handleLayoutCommit = (event: Event): void => {
    const pages = (event as CustomEvent<VisualPageInventoryEntry[]>).detail;
    if (!Array.isArray(pages)) return;
    latestPages = pages;
    if (!contentDirty) return;
    contentDirty = false;
    schedule(pages);
  };
  const handleEnabled = (event: Event): void => {
    enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled === true;
    if (enabled && demandedPageIndices.size === 0) {
      demandedPageIndices = new Set(latestPages.map((page) => page.pageIndex));
    }
    generation += 1;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (enabled && latestPages.length > 0) schedule(latestPages);
  };
  const handleDemand = (event: Event): void => {
    const detail = (event as CustomEvent<{ pageIndices?: unknown; targetWidth?: unknown }>).detail;
    if (!Array.isArray(detail?.pageIndices) || typeof detail.targetWidth !== 'number') return;
    demandedPageIndices = new Set(detail.pageIndices.filter((value): value is number => (
      Number.isInteger(value) && value >= 0
    )));
    targetWidth = detail.targetWidth;
    enabled = demandedPageIndices.size > 0;
    generation += 1;
    renderPending = enabled;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (enabled && latestPages.length > 0) schedule(latestPages);
  };
  const handleZoomInteraction = (event: Event): void => {
    const active = (event as CustomEvent<{ active?: boolean }>).detail?.active === true;
    if (active && (timer !== null || rendering)) renderPending = true;
    suspended = active;
    generation += 1;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (!active && renderPending && latestPages.length > 0) schedule(latestPages);
  };
  editor.addEventListener('visual-page-inventory-changed', handleInventory);
  editor.addEventListener('visual-page-content-changed', handleContentChange);
  editor.addEventListener('visual-page-thumbnails-enabled', handleEnabled);
  editor.addEventListener('visual-page-navigator-demand-changed', handleDemand);
  editor.addEventListener(VISUAL_PAGE_LAYOUT_COMMITTED, handleLayoutCommit);
  editor.addEventListener(VISUAL_ZOOM_INTERACTION_CHANGED, handleZoomInteraction);

  return () => {
    disposed = true;
    generation += 1;
    if (timer !== null) window.clearTimeout(timer);
    editor.removeEventListener('visual-page-inventory-changed', handleInventory);
    editor.removeEventListener('visual-page-content-changed', handleContentChange);
    editor.removeEventListener('visual-page-thumbnails-enabled', handleEnabled);
    editor.removeEventListener('visual-page-navigator-demand-changed', handleDemand);
    editor.removeEventListener(VISUAL_PAGE_LAYOUT_COMMITTED, handleLayoutCommit);
    editor.removeEventListener(VISUAL_ZOOM_INTERACTION_CHANGED, handleZoomInteraction);
  };
}

async function renderPages(
  editor: HTMLElement,
  pages: VisualPageInventoryEntry[],
  requestedWidth: number,
  scheduledGeneration: number,
  currentGeneration: () => number,
): Promise<void> {
  const style = getComputedStyle(editor);
  const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
  const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
  const layoutRevision = Number.parseInt(editor.dataset.pageLayoutRevision ?? '0', 10);
  if (!Number.isFinite(pageHeight) || pageHeight <= 0 || !Number.isFinite(pageGap)) return;

  for (const page of pages) {
    if (scheduledGeneration !== currentGeneration()) return;
    let dataUrl: string;
    try {
      dataUrl = await renderPage(editor, page.pageIndex, pageHeight, pageGap, requestedWidth);
    } catch (error: unknown) {
      if (scheduledGeneration !== currentGeneration()) return;
      editor.dispatchEvent(new CustomEvent<VisualPageThumbnailFailure>(
        'visual-page-thumbnail-failed',
        {
          detail: {
            layoutRevision,
            pageIndex: page.pageIndex,
            targetWidth: requestedWidth,
            message: error instanceof Error ? error.message : 'Thumbnail rendering failed',
          },
        },
      ));
      continue;
    }
    if (scheduledGeneration !== currentGeneration()) return;
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    editor.dispatchEvent(new CustomEvent<VisualPageThumbnail>('visual-page-thumbnail-changed', {
      detail: {
        layoutRevision,
        pageIndex: page.pageIndex,
        targetWidth: requestedWidth,
        mimeType: 'image/jpeg',
        dataBase64,
      },
    }));
    await nextFrame();
  }
}

async function renderPage(
  editor: HTMLElement,
  pageIndex: number,
  pageHeight: number,
  pageGap: number,
  requestedWidth: number,
): Promise<string> {
  const editorWidth = editor.offsetWidth;
  const editorRect = editor.getBoundingClientRect();
  const zoom = editorRect.width / editorWidth;
  const pageTop = pageIndex * (pageHeight + pageGap);
  const requestedHeight = Math.round(requestedWidth * 297 / 210);
  await document.fonts?.ready;
  console.info('[DEBUG-thumbnail] fonts ready', pageIndex);
  const svg = await toSvg(editor, {
    width: editorWidth,
    height: pageHeight,
    backgroundColor: '#fff',
    canvasWidth: requestedWidth,
    canvasHeight: requestedHeight,
    pixelRatio: 1,
    cacheBust: false,
    skipFonts: true,
    imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
    onImageErrorHandler: () => undefined,
    style: {
      height: `${editor.scrollHeight}px`,
      margin: '0',
      transform: `translateY(-${pageIndex * (pageHeight + pageGap)}px)`,
      transformOrigin: 'top left',
    },
    filter: (node) => {
      // Keep off-page layout boxes (their computed width/height are cloned), but
      // not their descendants. Cloning every glyph on every page produced >160MB
      // SVG data URLs for a 29-page report, which WebKit refuses to decode.
      const parent = node.parentElement;
      if (parent && parent !== editor) {
        const rect = parent.getBoundingClientRect();
        const top = (rect.top - editorRect.top) / zoom;
        if (rect.height > 0 && (top >= pageTop + pageHeight || top + rect.height / zoom <= pageTop)) {
          return false;
        }
      }
      return !(node instanceof Element) || (
        !node.matches('.visual-page-selection, .mu-selection, .mu-cursor')
        && !(node instanceof HTMLImageElement && node.src.startsWith('data:'))
      );
    },
  });
  console.info('[DEBUG-thumbnail] SVG ready', pageIndex, svg.length);
  const canvas = document.createElement('canvas');
  canvas.width = requestedWidth;
  canvas.height = requestedHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Thumbnail canvas context is unavailable');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const image = await loadImage(svg);
  console.info('[DEBUG-thumbnail] SVG decoded', pageIndex);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  compositeEmbeddedImages(canvas, editor, pageIndex, pageHeight, pageGap, editorWidth);
  return canvas.toDataURL('image/jpeg', 0.78);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Thumbnail SVG failed to load'));
    image.src = src;
  });
}

function compositeEmbeddedImages(
  canvas: HTMLCanvasElement,
  editor: HTMLElement,
  pageIndex: number,
  pageHeight: number,
  pageGap: number,
  editorWidth: number,
): void {
  const context = canvas.getContext('2d');
  if (!context || editorWidth <= 0 || pageHeight <= 0) return;
  const editorRect = editor.getBoundingClientRect();
  const zoom = editorRect.width / editorWidth;
  const scaleX = canvas.width / editorWidth;
  const scaleY = canvas.height / pageHeight;
  const pageTop = pageIndex * (pageHeight + pageGap);

  for (const image of editor.querySelectorAll<HTMLImageElement>('img[src^="data:"]')) {
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) continue;
    const rect = image.getBoundingClientRect();
    const layoutX = (rect.left - editorRect.left) / zoom;
    const layoutY = (rect.top - editorRect.top) / zoom - pageTop;
    if (layoutY >= pageHeight || layoutY + rect.height / zoom <= 0) continue;
    context.drawImage(
      image,
      layoutX * scaleX,
      layoutY * scaleY,
      rect.width / zoom * scaleX,
      rect.height / zoom * scaleY,
    );
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
