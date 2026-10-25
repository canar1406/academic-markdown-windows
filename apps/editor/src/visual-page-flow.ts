import { hcmutLogoUrl } from '@markdown/theme-hcmut-report-v1';

const A4_HEIGHT_TO_WIDTH = 297 / 210;
// Account for the editor's border/subpixel rounding so a marker one or two
// pixels from an A4 boundary does not get pushed an entire page forward.
const BOUNDARY_EPSILON = 2.5;

export interface VisualPageGeometry {
  pageHeight: number;
  pageGap: number;
}

/** A transient page entry derived from the current A4 layout. */
export interface VisualPageInventoryEntry {
  pageIndex: number;
  kind: 'semantic' | 'content' | 'blank';
  semanticName: string | null;
  blockCount: number;
  blockIndices: number[];
  /** Top-level insertion position used by page-aware add commands. */
  insertAfterIndex: number;
  deletable: boolean;
  title: string;
}

export interface VisualPageDecorationSettings {
  cover: {
    heading: string;
    logoEnabled: boolean;
    logoWidthCm: number;
    borderEnabled: boolean;
    outerBorderWidthPt: number;
    innerBorderWidthPt: number;
  };
  structure: {
    cover: boolean;
    toc: boolean;
    listOfFigures: boolean;
    listOfTables: boolean;
  };
  header: {
    /** Trusted host renderer from a validated authored scene, never source code. */
    renderContent?: () => HTMLElement;
    enabled: boolean;
    institution: string;
    faculty: string;
    logoEnabled: boolean;
    logoSizeMm: number;
    fontSizePt: number;
    bold: boolean;
    ruleEnabled: boolean;
    ruleWidthPt: number;
  };
  footer: {
    renderContent?: () => HTMLElement;
    enabled: boolean;
    left: string;
    pageNumber: 'current-total' | 'current' | 'none';
    fontSizePt: number;
    ruleEnabled: boolean;
    ruleWidthPt: number;
  };
}

export interface StructurePagePlacement {
  spacerBefore: number;
  slotHeight: number;
}

export interface PageBreakPlacement {
  pagebreakHeight: number;
  slotHeight: number;
}

export interface PageBreakPlacementOptions {
  consumeBoundaryPage?: boolean;
}

export interface ContentBlockPlacement {
  spacerBefore: number;
}

export interface PageStackPlacement {
  pageCount: number;
  stackHeight: number;
}

interface ScrollAnchor {
  element: HTMLElement | null;
  viewportTop: number;
  scrollTop: number;
}

export function calculatePageStackPlacement(
  requiredExtent: number,
  geometry: VisualPageGeometry,
): PageStackPlacement {
  const slotHeight = geometry.pageHeight + geometry.pageGap;
  const pageCount = Math.max(1, Math.ceil(Math.max(0, requiredExtent) / slotHeight));
  return {
    pageCount,
    stackHeight: pageCount * slotHeight - geometry.pageGap,
  };
}

export function calculateStructurePagePlacement(
  offsetFromContentStart: number,
  geometry: VisualPageGeometry,
): StructurePagePlacement {
  const slotHeight = geometry.pageHeight + geometry.pageGap;
  const offset = Math.max(0, offsetFromContentStart);
  const remainder = offset % slotHeight;
  const distanceToNextPage = slotHeight - remainder;
  const spacerBefore = remainder <= BOUNDARY_EPSILON || distanceToNextPage <= BOUNDARY_EPSILON
    ? 0
    : distanceToNextPage;

  return { spacerBefore, slotHeight };
}

export function calculatePageBreakPlacement(
  offsetFromContentStart: number,
  geometry: VisualPageGeometry,
  options: PageBreakPlacementOptions = {},
): PageBreakPlacement {
  const slotHeight = geometry.pageHeight + geometry.pageGap;
  const offset = Math.max(0, offsetFromContentStart);
  const remainder = offset % slotHeight;
  const isAtBoundary = remainder <= BOUNDARY_EPSILON
    || slotHeight - remainder <= BOUNDARY_EPSILON;
  // A page break always advances to the next A4 page. If layout has already
  // reached that boundary (for example after a cover), no extra slot is
  // needed. Only a consecutive break consumes the empty page it starts on.
  const pagebreakHeight = isAtBoundary
    ? options.consumeBoundaryPage === true ? slotHeight : 0
    : slotHeight - remainder;

  return { pagebreakHeight, slotHeight };
}

export function calculateContentBlockPlacement(
  offsetFromEditorTop: number,
  blockHeight: number,
  geometry: VisualPageGeometry,
  contentTop: number,
  contentBottom: number,
): ContentBlockPlacement {
  const slotHeight = geometry.pageHeight + geometry.pageGap;
  const pageOffset = positiveModulo(Math.max(0, offsetFromEditorTop), slotHeight);
  const printableEnd = geometry.pageHeight - contentBottom;
  const printableHeight = printableEnd - contentTop;
  const height = Math.max(0, blockHeight);
  const startsInBody = pageOffset >= contentTop - BOUNDARY_EPSILON
    && pageOffset < printableEnd - BOUNDARY_EPSILON;
  const fitsInBody = pageOffset + height <= printableEnd + BOUNDARY_EPSILON;

  if (startsInBody && fitsInBody) return { spacerBefore: 0 };
  if (height > printableHeight && Math.abs(pageOffset - contentTop) <= BOUNDARY_EPSILON) {
    return { spacerBefore: 0 };
  }

  if (pageOffset < contentTop - BOUNDARY_EPSILON) {
    return { spacerBefore: contentTop - pageOffset };
  }
  return { spacerBefore: slotHeight - pageOffset + contentTop };
}

export interface ApplyStructurePageFlowOptions extends VisualPageGeometry {
  contentTop?: number;
  contentBottom?: number;
  measureOffset?: (page: HTMLElement) => number;
  measureHeight?: (block: HTMLElement) => number;
}

export interface InstallVisualPageFlowOptions {
  getPageDecorationSettings?: () => VisualPageDecorationSettings;
  onPageInventoryChange?: (pages: VisualPageInventoryEntry[]) => void;
}

export const VISUAL_PAGE_LAYOUT_COMMITTED = 'visual-page-layout-committed';
export const VISUAL_PAGE_TRANSACTION_START = 'visual-page-transaction-start';

/**
 * Builds the page list from measured A4 slots. Page IDs are intentionally not
 * persisted; callers must treat the returned indices as valid only until the
 * next layout/content change.
 */
export function deriveVisualPageInventory(editor: HTMLElement): VisualPageInventoryEntry[] {
  const style = getComputedStyle(editor);
  const pageHeight = cssPixelValue(readCssVariable(editor, style, '--visual-page-height'), 0);
  const pageGap = cssPixelValue(readCssVariable(editor, style, '--visual-page-gap'), 24);
  if (pageHeight <= 0) return [];
  const slotHeight = pageHeight + pageGap;
  const stackHeight = cssPixelValue(
    readCssVariable(editor, style, '--visual-page-stack-height'),
    editor.scrollHeight,
  );
  const pageCount = Math.max(1, Math.ceil((Math.max(0, stackHeight) + pageGap) / slotHeight));
  const contentRoot = directContentRoot(editor);
  const blocks = [...contentRoot.children].filter((element): element is HTMLElement => (
    element instanceof HTMLElement
  ));
  const entries: VisualPageInventoryEntry[] = Array.from({ length: pageCount }, (_, pageIndex) => ({
    pageIndex,
    kind: 'blank' as const,
    semanticName: null,
    blockCount: 0,
    blockIndices: [] as number[],
    insertAfterIndex: -1,
    deletable: false,
    title: `Trang ${pageIndex + 1}`,
  }));

  for (const [index, block] of blocks.entries()) {
    if (block.hidden) continue;
    const top = Math.max(0, measureLayoutOffset(editor, block));
    const blockHeight = measureLayoutHeight(editor, block);
    const bottom = Math.max(top + 1, top + blockHeight);
    const firstPage = Math.min(pageCount - 1, Math.floor((top + BOUNDARY_EPSILON) / slotHeight));
    const lastPage = Math.min(pageCount - 1, Math.floor((bottom - BOUNDARY_EPSILON) / slotHeight));
    const semanticName = block.dataset.lmxName;
    const isPageBreak = semanticName === 'pagebreak';
    const pageBreakHeight = isPageBreak ? blockHeight : 0;
    const ownsFullSlot = isPageBreak && pageBreakHeight >= slotHeight - BOUNDARY_EPSILON;
    // A mid-page break belongs to the next sheet it opens. A zero-height break
    // already sits at that sheet's boundary, while a consecutive break owns
    // the complete blank sheet it consumes.
    const pages = isFullPageStructureBlock(block)
      ? [firstPage]
      : isPageBreak
        ? [Math.min(
            pageCount - 1,
            ownsFullSlot || pageBreakHeight <= BOUNDARY_EPSILON ? firstPage : firstPage + 1,
          )]
      : Array.from({ length: Math.max(1, lastPage - firstPage + 1) }, (_, offset) => firstPage + offset);
    for (const pageIndex of pages) {
      const entry = entries[pageIndex];
      entry.blockIndices.push(index);
      if (semanticName === 'pagebreak') {
        // The directive is a boundary implementation detail, not a visible
        // semantic sheet. Its card represents a deletable blank A4 page.
        entry.blockCount += 1;
        entry.deletable = true;
        continue;
      }
      entry.blockCount += 1;
      if (semanticName && isSemanticPageInventoryBlock(block)) {
        entry.kind = 'semantic';
        entry.semanticName = semanticName;
        entry.title = semanticTitle(semanticName);
        entry.deletable = true;
      } else if (entry.kind !== 'semantic') {
        entry.kind = 'content';
        entry.title = `Trang ${pageIndex + 1}`;
        entry.deletable = true;
      }
    }
  }

  const lastEntry = entries.at(-1);
  const previousEntry = entries.length >= 2 ? entries.at(-2) : undefined;
  if (
    lastEntry
    && previousEntry
    && lastEntry.kind === 'blank'
    && lastEntry.blockIndices.length === 0
    && previousEntry.blockIndices.length >= 2
  ) {
    const candidateBreakIndex = previousEntry.blockIndices.at(-1)!;
    if (blocks[candidateBreakIndex]?.dataset.lmxName === 'pagebreak') {
      previousEntry.blockIndices.pop();
      previousEntry.blockCount = Math.max(0, previousEntry.blockCount - 1);
      lastEntry.blockIndices.push(candidateBreakIndex);
      lastEntry.blockCount = 1;
      lastEntry.deletable = true;
    }
  }

  const ownershipCount = new Map<number, number>();
  for (const entry of entries) {
    for (const blockIndex of entry.blockIndices) {
      ownershipCount.set(blockIndex, (ownershipCount.get(blockIndex) ?? 0) + 1);
    }
  }

  for (const entry of entries) {
    if (entry.blockIndices.length > 0) {
      entry.insertAfterIndex = Math.max(...entry.blockIndices);
    } else {
      const nextBlockIndex = blocks.findIndex((block) => {
        if (block.hidden) return false;
        const top = Math.max(0, measureLayoutOffset(editor, block));
        return Math.floor((top + BOUNDARY_EPSILON) / slotHeight) > entry.pageIndex;
      });
      entry.insertAfterIndex = nextBlockIndex === -1 ? blocks.length - 1 : nextBlockIndex - 1;
    }
    if (entry.blockIndices.some(index => (ownershipCount.get(index) ?? 0) > 1)) {
      entry.deletable = false;
    }
    if (entry.kind === 'blank') entry.title = `Trang ${entry.pageIndex + 1} (trống)`;
  }
  return entries;
}

export function applyStructurePageFlow(
  editor: HTMLElement,
  options: ApplyStructurePageFlowOptions,
): void {
  const contentTop = options.contentTop ?? 0;
  const contentBottom = options.contentBottom ?? 0;
  const contentRoot = directContentRoot(editor);
  const blocks = [...contentRoot.children].filter((element): element is HTMLElement => (
    element instanceof HTMLElement
  ));

  for (const block of blocks) {
    block.style.setProperty('--visual-page-spacer-before', '0px');
    block.style.removeProperty('--visual-page-slot-height');
    block.style.removeProperty('--visual-pagebreak-height');
    if (!isStructureBlock(block)) prepareOrdinaryBlock(block);
  }
  void editor.offsetTop;

  for (const block of blocks) {
    if (block.hidden) continue;
    const offsetFromContentStart = options.measureOffset
      ? options.measureOffset(block)
      : measureOffsetFromContentStart(editor, block, contentTop);

    if (isFullPageStructureBlock(block)) {
      const placement = calculateStructurePagePlacement(offsetFromContentStart, options);
      block.style.setProperty('--visual-page-spacer-before', `${placement.spacerBefore}px`);
      block.style.setProperty('--visual-page-slot-height', `${placement.slotHeight}px`);
      continue;
    }

    if (block.dataset.lmxName === 'pagebreak') {
      const previous = previousVisibleSibling(block);
      const placement = calculatePageBreakPlacement(offsetFromContentStart, options, {
        // A break at the start of the document ends the empty first page. A
        // consecutive break ends the empty page opened by the previous break.
        // Every other boundary is already the requested next page.
        consumeBoundaryPage: !previous || previous.dataset.lmxName === 'pagebreak',
      });
      block.style.setProperty('--visual-pagebreak-height', `${placement.pagebreakHeight}px`);
      continue;
    }

    const offsetFromEditorTop = offsetFromContentStart + contentTop;
    let height = options.measureHeight?.(block) ?? measureLayoutHeight(editor, block);
    // Don't strand a heading at the bottom when the next table/block moves.
    // Reserve a fitting heading chain + following block, without introducing
    // persistent breaks or grouping content larger than the usable page.
    if (block.matches('.mu-atx-heading, h1, h2, h3, h4, h5, h6')) {
      let next = block.nextElementSibling;
      while (next instanceof HTMLElement && next.hidden) next = next.nextElementSibling;
      while (next instanceof HTMLElement && !isStructureBlock(next)) {
        const nextOffset = options.measureOffset
          ? options.measureOffset(next)
          : measureOffsetFromContentStart(editor, next, contentTop);
        const nextHeight = options.measureHeight?.(next) ?? measureLayoutHeight(editor, next);
        const groupedHeight = nextOffset - offsetFromContentStart + nextHeight;
        if (groupedHeight > 0 && groupedHeight <= options.pageHeight - contentTop - contentBottom) {
          height = Math.max(height, groupedHeight);
        } else break;
        if (!next.matches('.mu-atx-heading, h1, h2, h3, h4, h5, h6')) break;
        next = next.nextElementSibling;
      }
    }
    const placement = calculateContentBlockPlacement(
      offsetFromEditorTop,
      height,
      options,
      contentTop,
      contentBottom,
    );
    // Vertical margins between Muya siblings collapse. When a block is moved
    // to the next sheet, include the preceding sibling's margin-bottom so the
    // resulting margin box still lands at the printable body edge.
    const previous = block.previousElementSibling instanceof HTMLElement
      ? block.previousElementSibling
      : null;
    const previousMarginBottom = previous
      ? cssPixelValue(getComputedStyle(previous).marginBottom, 0)
      : 0;
    const baseMarginTop = cssPixelValue(
      block.style.getPropertyValue('--visual-block-base-margin-top'),
      0,
    );
    const collapsedMarginCompensation = placement.spacerBefore > 0
      ? Math.max(0, previousMarginBottom - baseMarginTop)
      : 0;
    block.style.setProperty(
      '--visual-block-spacer-before',
      `${placement.spacerBefore + collapsedMarginCompensation}px`,
    );
  }
}

export function installVisualPageFlow(
  editor: HTMLElement,
  options: InstallVisualPageFlowOptions = {},
): () => void {
  let animationFrame: number | null = null;
  let scheduleGeneration = 0;
  let microtaskPending = false;
  let composing = false;
  let disposed = false;
  let inventoryFingerprint = '';
  let lastFlowSignature = '';
  let lastTopLevelBlocks: HTMLElement[] = [];
  const scrollContainer = editor.closest<HTMLElement>('.editor-stage');
  let pendingScrollAnchor: ScrollAnchor | null = null;

  const captureScrollPosition = (): void => {
    if (!scrollContainer || pendingScrollAnchor) return;
    const stageRect = scrollContainer.getBoundingClientRect();
    const candidates = [...directContentRoot(editor).children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && !element.hidden);
    const selectionNode = window.getSelection()?.anchorNode ?? null;
    const activeBlock = selectionNode
      ? candidates.find((element) => element === selectionNode || element.contains(selectionNode))
      : undefined;
    const activeRect = activeBlock?.getBoundingClientRect();
    const visibleActiveBlock = activeBlock && activeRect
      && activeRect.bottom > stageRect.top
      && activeRect.top < stageRect.bottom
      ? activeBlock
      : undefined;
    const anchor = visibleActiveBlock
      ?? candidates.find((element) => element.getBoundingClientRect().bottom > stageRect.top)
      ?? candidates.at(-1);
    pendingScrollAnchor = {
      element: anchor ?? null,
      viewportTop: anchor?.getBoundingClientRect().top ?? stageRect.top,
      scrollTop: scrollContainer.scrollTop,
    };
  };

  const cancelPendingScrollRestore = (): void => {
    pendingScrollAnchor = null;
  };

  const restoreScrollPosition = (didReflow: boolean): void => {
    if (!pendingScrollAnchor || !scrollContainer) return;
    const anchor = pendingScrollAnchor;
    pendingScrollAnchor = null;
    if (!didReflow) return;
    if (anchor.element?.isConnected) {
      const delta = anchor.element.getBoundingClientRect().top - anchor.viewportTop;
      if (Math.abs(delta) >= 0.5) {
        scrollContainer.scrollTop += delta;
      }
    } else {
      scrollContainer.scrollTop = anchor.scrollTop;
    }
  };

  const computeFlowSignature = (
    blocks: HTMLElement[],
    width: number,
    pageHeight: number,
    pageGap: number,
    contentTop: number,
    contentBottom: number,
  ): string => {
    const parts: Array<string | number> = [width, pageHeight, pageGap, contentTop, contentBottom, blocks.length];
    for (const block of blocks) {
      const lmxName = block.dataset.lmxName ?? '';
      const structure = isStructureBlock(block);
      const enabled = structure ? isEnabledStructureBlock(block) : true;
      // For ordinary blocks and disabled structure blocks, height is independent
      // of `--visual-block-spacer-before` (which only sets margin-top).
      const intrinsicHeight = (!structure || !enabled) && !block.hidden
        ? Math.round(measureLayoutHeight(editor, block) * 2)
        : 0;
      parts.push(
        block.tagName,
        block.hidden ? 1 : 0,
        lmxName,
        structure ? 1 : 0,
        enabled ? 1 : 0,
        intrinsicHeight,
      );
    }
    return parts.join('|');
  };

  const update = (): void => {
    if (disposed) return;
    animationFrame = null;
    microtaskPending = false;
    // Reflow moves the active contenteditable and the IME candidate window.
    // Defer even already-queued layout work until Muya commits composition.
    if (composing) return;
    const style = getComputedStyle(editor);
    const width = editor.offsetWidth;
    const pageHeight = width * A4_HEIGHT_TO_WIDTH;
    const pageGap = cssPixelValue(style.getPropertyValue('--visual-page-gap'), 24);
    const contentTop = cssPixelValue(style.getPropertyValue('--visual-page-content-top'), 88);
    const contentBottom = cssPixelValue(style.getPropertyValue('--visual-page-content-bottom'), 78);
    editor.style.setProperty('--visual-page-height', `${pageHeight}px`);
    const contentRoot = directContentRoot(editor);
    const blocks = [...contentRoot.children].filter((element): element is HTMLElement => (
      element instanceof HTMLElement
    ));
    const sameBlockIdentities = blocks.length === lastTopLevelBlocks.length
      && blocks.every((block, idx) => block === lastTopLevelBlocks[idx]);
    const nextFlowSignature = computeFlowSignature(
      blocks,
      width,
      pageHeight,
      pageGap,
      contentTop,
      contentBottom,
    );
    const needsStructureFlow = !sameBlockIdentities || nextFlowSignature !== lastFlowSignature;
    if (needsStructureFlow) {
      applyStructurePageFlow(editor, { pageHeight, pageGap, contentTop, contentBottom });
      lastTopLevelBlocks = blocks;
      lastFlowSignature = computeFlowSignature(
        blocks,
        width,
        pageHeight,
        pageGap,
        contentTop,
        contentBottom,
      );
    }
    const pageStack = calculatePageStackPlacement(
      measureRequiredPageExtent(editor, { pageHeight, pageGap }, contentTop),
      { pageHeight, pageGap },
    );
    editor.style.setProperty('--visual-page-stack-height', `${pageStack.stackHeight}px`);
    if (options.getPageDecorationSettings) {
      applyVisualPageDecorations(editor, {
        pageHeight,
        pageGap,
        pageCount: pageStack.pageCount,
        contentTop,
        contentBottom,
        contentLeft: cssPixelValue(style.getPropertyValue('--visual-page-content-left'), 117),
        contentRight: cssPixelValue(style.getPropertyValue('--visual-page-content-right'), 78),
        settings: options.getPageDecorationSettings(),
      });
    }
    const inventory = deriveVisualPageInventory(editor);
    const nextFingerprint = JSON.stringify(inventory);
    if (nextFingerprint !== inventoryFingerprint) {
      inventoryFingerprint = nextFingerprint;
      options.onPageInventoryChange?.(inventory);
      editor.dispatchEvent(new CustomEvent('visual-page-inventory-changed', { detail: inventory }));
    }
    restoreScrollPosition(needsStructureFlow);
    editor.dispatchEvent(new CustomEvent(VISUAL_PAGE_LAYOUT_COMMITTED, { detail: inventory }));
  };

  const schedule = (): void => {
    if (disposed || composing || microtaskPending) return;
    const generation = ++scheduleGeneration;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => {
      if (generation !== scheduleGeneration) return;
      update();
    });
  };

  const handleEditorInput = (): void => {
    captureScrollPosition();
    schedule();
  };

  const startComposition = (): void => {
    composing = true;
    ++scheduleGeneration;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const finishComposition = (): void => {
    if (!composing) return;
    composing = false;
    schedule();
  };

  const handleFocusOut = (event: FocusEvent): void => {
    if (!(event.relatedTarget instanceof Node) || !editor.contains(event.relatedTarget)) {
      finishComposition();
    }
  };

  const flush = (): void => {
    composing = false;
    ++scheduleGeneration;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    if (microtaskPending) return;
    microtaskPending = true;
    // Let Muya finish its synchronous DOM transaction before measuring. A
    // direct re-entrant layout pass can leave a newly inserted block hidden.
    queueMicrotask(update);
  };

  const handlePageTransactionStart = (): void => {
    composing = false;
    captureScrollPosition();
    // Structural DOM changes are synchronous, but Muya commits canonical JSON
    // on the next animation frame. Queue layout scheduling after the mutation
    // so JSON state commits before page inventory unlocks the next action.
    queueMicrotask(() => {
      if (!disposed) schedule();
    });
  };

  const updateSelection = (): void => {
    const style = getComputedStyle(editor);
    const pageHeight = cssPixelValue(style.getPropertyValue('--visual-page-height'), 0);
    const pageGap = cssPixelValue(style.getPropertyValue('--visual-page-gap'), 24);
    const stackHeight = cssPixelValue(style.getPropertyValue('--visual-page-stack-height'), editor.scrollHeight);
    if (pageHeight <= 0) return;
    const pageCount = Math.max(1, Math.ceil((stackHeight + pageGap) / (pageHeight + pageGap)));
    updateVisualPageSelection(editor, pageCount, pageHeight, pageHeight + pageGap);
  };

  const mutationObserver = new MutationObserver((records) => {
    // Decoration nodes, selection overlays, and page action strips do not
    // alter content pagination. Ignore those mutations so they cannot trigger
    // unnecessary layout passes or update loops.
    const contentChanged = records.some((record) => {
      const target = record.target instanceof Element
        ? record.target
        : record.target.parentElement;
      return !target?.closest(
        '.visual-page-decorations, .visual-page-action-layer, .mu-selection, .mu-cursor, [data-blank-page-input]',
      );
    });
    if (composing && records.some((record) => (
      record.type === 'childList'
      && record.removedNodes.length > 0
      && record.target instanceof Element
      && record.target.classList.contains('mu-container')
    ))) {
      composing = false;
    }
    if (contentChanged) schedule();
  });
  mutationObserver.observe(editor, {
    attributes: true,
    attributeFilter: ['hidden'],
    characterData: true,
    childList: true,
    subtree: true,
  });
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  resizeObserver?.observe(editor);
  window.addEventListener('resize', schedule);
  scrollContainer?.addEventListener('scroll', cancelPendingScrollRestore, { passive: true });
  editor.addEventListener('input', handleEditorInput, true);
  editor.addEventListener('compositionstart', startComposition, true);
  editor.addEventListener('compositionend', finishComposition, true);
  editor.addEventListener('focusout', handleFocusOut);
  editor.addEventListener(VISUAL_PAGE_TRANSACTION_START, handlePageTransactionStart);
  editor.addEventListener('visual-metadata-visibility-changed', flush);
  editor.addEventListener('visual-page-selection-changed', updateSelection);
  schedule();

  return () => {
    disposed = true;
    ++scheduleGeneration;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener('resize', schedule);
    scrollContainer?.removeEventListener('scroll', cancelPendingScrollRestore);
    editor.removeEventListener('input', handleEditorInput, true);
    editor.removeEventListener('compositionstart', startComposition, true);
    editor.removeEventListener('compositionend', finishComposition, true);
    editor.removeEventListener('focusout', handleFocusOut);
    editor.removeEventListener(VISUAL_PAGE_TRANSACTION_START, handlePageTransactionStart);
    editor.removeEventListener('visual-metadata-visibility-changed', flush);
    editor.removeEventListener('visual-page-selection-changed', updateSelection);
  };
}

interface VisualPageDecorationLayout extends VisualPageGeometry {
  pageCount: number;
  contentTop: number;
  contentBottom: number;
  contentLeft: number;
  contentRight: number;
  settings: VisualPageDecorationSettings;
}

function updateVisualPageSelection(
  editor: HTMLElement,
  pageCount: number,
  pageHeight: number,
  slotHeight: number,
  providedDecorations?: HTMLElement,
): void {
  const decorations = providedDecorations
    ?? editor.querySelector<HTMLElement>(':scope > .visual-page-decorations');
  if (!decorations) return;
  decorations.querySelector(':scope > .visual-page-selection')?.remove();
  const selectedPageIndex = Number.parseInt(editor.dataset.selectedPageIndex ?? '', 10);
  if (!Number.isInteger(selectedPageIndex) || selectedPageIndex < 0 || selectedPageIndex >= pageCount) {
    return;
  }
  const selection = document.createElement('div');
  selection.className = 'visual-page-selection';
  selection.style.top = `${selectedPageIndex * slotHeight}px`;
  selection.style.height = `${pageHeight}px`;
  decorations.prepend(selection);
}

function applyVisualPageDecorations(editor: HTMLElement, layout: VisualPageDecorationLayout): void {
  let decorations = editor.querySelector<HTMLElement>(':scope > .visual-page-decorations');
  if (!decorations) {
    decorations = document.createElement('div');
    decorations.className = 'visual-page-decorations';
    editor.append(decorations);
  }

  const slotHeight = layout.pageHeight + layout.pageGap;
  const pageCount = layout.pageCount;
  updateVisualPageSelection(editor, pageCount, layout.pageHeight, slotHeight, decorations);
  const specialPages = [...editor.querySelectorAll<HTMLElement>([
    '.mu-lmx-structure[data-lmx-name="cover"]',
    '.mu-lmx-structure[data-lmx-name="toc"]',
    '.mu-lmx-structure[data-lmx-name="list-of-figures"]',
    '.mu-lmx-structure[data-lmx-name="list-of-tables"]',
    '.mu-lmx-directive[data-lmx-name="front-section"]',
  ].join(','))].filter(isEnabledStructureBlock).map((element) => {
    const top = measureLayoutOffset(editor, element);
    return Math.floor(Math.max(0, top) / slotHeight);
  });
  const lastSpecialPage = specialPages.length > 0 ? Math.max(...specialPages) : -1;
  const contentRoot = editor.querySelector<HTMLElement>(':scope > .mu-container');
  const firstBodyPage = contentRoot
    ? [...contentRoot.children]
      .filter((element): element is HTMLElement => (
        element instanceof HTMLElement
        && !element.hidden
        && !isFullPageStructureBlock(element)
        && element.dataset.lmxName !== 'pagebreak'
      ))
      .map((element) => {
        const top = measureLayoutOffset(editor, element);
        return Math.floor(Math.max(0, top) / slotHeight);
      })
      .find((page) => page > lastSpecialPage)
    : undefined;
  // Decorations follow the first actual body block. This prevents a stale
  // page-flow spacer (or an explicit break) from leaving a header on an empty
  // page while the body has already moved to the next A4 sheet.
  const bodyStartPage = Math.max(lastSpecialPage + 1, firstBodyPage ?? 0);
  const decoratedPages = Array.from({ length: pageCount }, (_, pageIndex) => pageIndex)
    .filter((pageIndex) => !specialPages.includes(pageIndex));
  const bodyPageCount = Math.max(1, decoratedPages.length);
  synchronizeHeadingNumbers(editor);
  synchronizeTocPageNumbers(editor, slotHeight, bodyStartPage);
  synchronizeGeneratedListPageNumbers(editor, slotHeight, bodyStartPage);

  const hasCustomRenderer = Boolean(
    layout.settings.header.renderContent || layout.settings.footer.renderContent,
  );
  const decorationSignature = hasCustomRenderer
    ? ''
    : JSON.stringify({
      pageHeight: layout.pageHeight,
      pageGap: layout.pageGap,
      contentTop: layout.contentTop,
      contentBottom: layout.contentBottom,
      contentLeft: layout.contentLeft,
      contentRight: layout.contentRight,
      decoratedPages,
      bodyPageCount,
      header: layout.settings.header,
      footer: layout.settings.footer,
    });
  if (!hasCustomRenderer && decorations.dataset.decorationSignature === decorationSignature) {
    return;
  }
  decorations.dataset.decorationSignature = decorationSignature;
  decorations.querySelectorAll(':scope > .visual-page-header, :scope > .visual-page-footer')
    .forEach((node) => node.remove());

  for (const [bodyPageOffset, pageIndex] of decoratedPages.entries()) {
    const pageTop = pageIndex * slotHeight;
    if (layout.settings.header.enabled) {
      const header = document.createElement('div');
      header.className = 'visual-page-header';
      header.style.top = `${pageTop + layout.contentTop}px`;
      header.style.transform = 'translateY(-100%)';
      header.style.left = `${layout.contentLeft}px`;
      header.style.right = `${layout.contentRight}px`;
      header.style.fontSize = `${layout.settings.header.fontSizePt * 96 / 72}px`;
      header.style.fontWeight = layout.settings.header.bold ? '700' : '400';
      header.style.borderBottomStyle = layout.settings.header.ruleEnabled ? 'solid' : 'none';
      header.style.borderBottomWidth = `${layout.settings.header.ruleWidthPt * 96 / 72}px`;
      if (layout.settings.header.logoEnabled) {
        const logo = document.createElement('img');
        logo.className = 'visual-page-header-logo';
        logo.src = hcmutLogoUrl;
        logo.alt = '';
        const logoSize = layout.settings.header.logoSizeMm * 96 / 25.4;
        logo.style.width = `${logoSize}px`;
        logo.style.height = `${logoSize}px`;
        header.append(logo);
      } else {
        header.classList.add('visual-page-header-without-logo');
      }
      appendDecorationText(header, 'visual-page-header-institution', layout.settings.header.institution);
      appendDecorationText(header, 'visual-page-header-faculty', layout.settings.header.faculty);
      if (layout.settings.header.renderContent) {
        header.replaceChildren(layout.settings.header.renderContent());
        header.style.display = 'block';
      }
      decorations.append(header);
    }
    if (layout.settings.footer.enabled) {
      const footer = document.createElement('div');
      footer.className = 'visual-page-footer';
      footer.style.top = `${pageTop + layout.pageHeight - layout.contentBottom}px`;
      // Pagination reserves everything below this body boundary. Translating
      // the footer upward placed its ink *inside* the last printable line.
      footer.style.transform = 'none';
      footer.style.left = `${layout.contentLeft}px`;
      footer.style.right = `${layout.contentRight}px`;
      footer.style.fontSize = `${layout.settings.footer.fontSizePt * 96 / 72}px`;
      footer.style.borderTopStyle = layout.settings.footer.ruleEnabled ? 'solid' : 'none';
      footer.style.borderTopWidth = `${layout.settings.footer.ruleWidthPt * 96 / 72}px`;
      appendDecorationText(footer, 'visual-page-footer-left', layout.settings.footer.left);
      if (layout.settings.footer.renderContent) {
        footer.replaceChildren(layout.settings.footer.renderContent());
        footer.style.display = 'block';
      }
      if (layout.settings.footer.pageNumber !== 'none') {
        const bodyPageNumber = bodyPageOffset + 1;
        const pageNumber = layout.settings.footer.pageNumber === 'current'
          ? `Trang ${bodyPageNumber}`
          : `Trang ${bodyPageNumber}/${bodyPageCount}`;
        appendDecorationText(footer, 'visual-page-footer-number', pageNumber);
      }
      decorations.append(footer);
    }
  }
}

function synchronizeHeadingNumbers(editor: HTMLElement): void {
  const counters = [0, 0, 0, 0];
  for (const heading of editor.querySelectorAll<HTMLElement>('.mu-atx-heading')) {
    const level = Math.min(4, Math.max(1, Number.parseInt(heading.tagName.slice(1), 10) || 1));
    counters[level - 1] += 1;
    counters.fill(0, level);
    const parts = counters.slice(0, level).map(String);
    if (level === 4) parts[3] = alphabeticCounter(counters[3]);
    const nextNumber = parts.join('.');
    if (heading.dataset.hcmutHeadingNumber !== nextNumber) {
      heading.dataset.hcmutHeadingNumber = nextNumber;
    }
  }
}

function alphabeticCounter(value: number): string {
  let remaining = Math.max(1, value);
  let result = '';
  while (remaining > 0) {
    remaining -= 1;
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return result;
}

function synchronizeTocPageNumbers(
  editor: HTMLElement,
  slotHeight: number,
  bodyStartPage: number,
): void {
  const rows = [...editor.querySelectorAll<HTMLElement>(
    '.mu-lmx-toc-preview .hcmut-generated-row[data-toc-level]',
  )];
  if (rows.length === 0) return;

  const headings = [...editor.querySelectorAll<HTMLElement>('.mu-atx-heading')];
  for (const [index, row] of rows.entries()) {
    const page = row.querySelector<HTMLElement>('.hcmut-generated-page');
    const heading = headings[index];
    if (!page || !heading) continue;
    const absolutePage = Math.floor(Math.max(0, measureLayoutOffset(editor, heading)) / slotHeight);
    const bodyPageNumber = Math.max(1, absolutePage - bodyStartPage + 1);
    const nextValue = String(bodyPageNumber);
    if (page.textContent !== nextValue) page.textContent = nextValue;
  }
}

function synchronizeGeneratedListPageNumbers(
  editor: HTMLElement,
  slotHeight: number,
  bodyStartPage: number,
): void {
  for (const targetName of ['figure', 'table']) {
    const blocks = [...editor.querySelectorAll<HTMLElement>(
      `.mu-lmx-directive[data-lmx-name="${targetName}"]`,
    )];
    const rows = [...editor.querySelectorAll<HTMLElement>(
      `.mu-lmx-${targetName === 'figure' ? 'list-of-figures' : 'list-of-tables'}-preview `
      + `.hcmut-generated-row[data-generated-target="${targetName}"]`,
    )];
    for (const [index, row] of rows.entries()) {
      const page = row.querySelector<HTMLElement>('.hcmut-generated-page');
      const block = blocks[index];
      if (!page || !block) continue;
      const absolutePage = Math.floor(Math.max(0, measureLayoutOffset(editor, block)) / slotHeight);
      const bodyPageNumber = Math.max(1, absolutePage - bodyStartPage + 1);
      if (page.textContent !== String(bodyPageNumber)) page.textContent = String(bodyPageNumber);
    }
  }
}

function measureRequiredPageExtent(
  editor: HTMLElement,
  geometry: VisualPageGeometry,
  contentTop: number,
): number {
  const contentRoot = directContentRoot(editor);
  const slotHeight = geometry.pageHeight + geometry.pageGap;
  let pageCount = 1;

  for (const element of contentRoot.children) {
    if (!(element instanceof HTMLElement) || element.hidden) continue;
    const offset = Math.max(0, measureOffsetFromContentStart(editor, element, contentTop));
    const startPage = Math.floor((offset + BOUNDARY_EPSILON) / slotHeight);

    if (isFullPageStructureBlock(element)) {
      // Structural sheets are followed by a writable Visual sheet. An empty
      // Muya paragraph cannot round-trip through Markdown, so deriving this
      // sheet from the semantic block keeps it stable after slash insertions.
      pageCount = Math.max(pageCount, startPage + 2);
      continue;
    }

    // A break ends its current page and leaves the following A4 sheet
    // writable. A zero-height boundary break is already positioned on that
    // following sheet; a non-zero break must reserve one sheet beyond itself.
    if (element.dataset.lmxName === 'pagebreak') {
      const height = measureLayoutHeight(editor, element);
      const lastOccupiedPage = Math.floor(Math.max(
        0,
        offset + Math.max(height, 1) - BOUNDARY_EPSILON,
      ) / slotHeight);
      const requiredPages = height <= BOUNDARY_EPSILON
        ? startPage + 1
        : lastOccupiedPage + 2;
      pageCount = Math.max(pageCount, requiredPages);
      continue;
    }

    const height = measureLayoutHeight(editor, element);
    const lastPage = Math.floor(Math.max(0, offset + Math.max(height, 1) - BOUNDARY_EPSILON) / slotHeight);
    pageCount = Math.max(pageCount, lastPage + 1);
  }

  return pageCount * slotHeight;
}

function appendDecorationText(parent: HTMLElement, className: string, text: string): void {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  parent.append(element);
}

function measureOffsetFromContentStart(
  editor: HTMLElement,
  page: HTMLElement,
  contentTop: number,
): number {
  return measureLayoutOffset(editor, page) - contentTop;
}

function measureLayoutOffset(editor: HTMLElement, element: HTMLElement): number {
  // `getBoundingClientRect()` includes transient FLIP transforms. Feeding that
  // visual position back into pagination turns an animation offset into a real
  // page spacer. offsetTop follows layout geometry and is transform-invariant.
  let offset = 0;
  let current: HTMLElement | null = element;
  while (current && current !== editor) {
    offset += current.offsetTop;
    const parent: Element | null = current.offsetParent;
    current = parent instanceof HTMLElement ? parent : null;
  }
  if (current === editor) return offset;

  const editorRect = editor.getBoundingClientRect();
  const scale = renderedLayoutScale(editor, editorRect);
  return (element.getBoundingClientRect().top - editorRect.top) / scale;
}

function measureLayoutHeight(editor: HTMLElement, element: HTMLElement): number {
  return element.getBoundingClientRect().height / renderedLayoutScale(editor);
}

function renderedLayoutScale(editor: HTMLElement, rect = editor.getBoundingClientRect()): number {
  const scale = editor.offsetWidth > 0 ? rect.width / editor.offsetWidth : 1;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function cssPixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCssVariable(editor: HTMLElement, style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name) || editor.style.getPropertyValue(name);
}

function directContentRoot(editor: HTMLElement): HTMLElement {
  return [...editor.children].find((child): child is HTMLElement => (
    child instanceof HTMLElement && child.classList.contains('mu-container')
  )) ?? editor;
}

function isStructureBlock(block: HTMLElement): boolean {
  return block.classList.contains('mu-lmx-structure');
}

function isFullPageStructureBlock(block: HTMLElement): boolean {
  return isEnabledStructureBlock(block) && (block.dataset.lmxName === 'cover'
    || block.dataset.lmxName === 'toc'
    || block.dataset.lmxName === 'list-of-figures'
    || block.dataset.lmxName === 'list-of-tables'
    || block.dataset.lmxName === 'front-section');
}

function isSemanticPageInventoryBlock(block: HTMLElement): boolean {
  return isFullPageStructureBlock(block);
}

function semanticTitle(name: string): string {
  switch (name) {
    case 'cover': return 'Trang bìa';
    case 'toc': return 'Mục lục';
    case 'list-of-figures': return 'Danh sách hình';
    case 'list-of-tables': return 'Danh sách bảng';
    case 'front-section': return 'Phần đầu tài liệu';
    case 'pagebreak': return 'Ngắt trang';
    default: return name;
  }
}

function isEnabledStructureBlock(block: HTMLElement): boolean {
  if (block.dataset.lmxName === 'front-section') return true;
  return block.querySelector<HTMLElement>('.mu-lmx-structure-preview')
    ?.dataset.structureEnabled !== 'false';
}

function previousVisibleSibling(block: HTMLElement): HTMLElement | undefined {
  let sibling = block.previousElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLElement && !sibling.hidden) return sibling;
    sibling = sibling.previousElementSibling;
  }
  return undefined;
}

function prepareOrdinaryBlock(block: HTMLElement): void {
  if (!block.hasAttribute('data-visual-page-flow-block')) {
    const marginTop = cssPixelValue(getComputedStyle(block).marginTop, 0);
    block.style.setProperty('--visual-block-base-margin-top', `${marginTop}px`);
    block.setAttribute('data-visual-page-flow-block', '');
  }
  block.style.setProperty('--visual-block-spacer-before', '0px');
}

function positiveModulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}
