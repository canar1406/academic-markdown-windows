import {
  createDocumentIndex,
  parseFrontMatter,
  type DocumentDiagnostic,
  type DocumentSourceRange,
} from '@markdown/document-core';
import { EditorModeController, type EditorMode, type VisualMarkdownEditor } from './editor-mode';
import type { CodeMirrorSourceEditor } from './source-editor';
import {
  deriveVisualPageInventory,
  VISUAL_PAGE_LAYOUT_COMMITTED,
  VISUAL_PAGE_TRANSACTION_START,
  type VisualPageInventoryEntry,
} from './visual-page-flow';
import type { VisualPageThumbnail, VisualPageThumbnailFailure } from './page-thumbnail-renderer';
import type { PageNavigatorDemand } from './bridge';
import {
  createAdjacentPageMovePlan,
  createMoveIntoBlankPagePlan,
  createPageDeletePlan,
  type PageMoveDirection,
} from './page-reorder';

export class EditorSurface {
  private readonly modeController: EditorModeController;
  private readonly changeListeners = new Set<() => void>();
  private readonly modeChangeListeners = new Set<(transition: EditorModeTransition) => void>();
  private readonly lmxSelectionListeners = new Set<(selection: LmxBlockSelection) => void>();
  private readonly pageSelectionListeners = new Set<(selection: VisualPageSelection | null) => void>();
  private readonly pageInventoryListeners = new Set<(pages: VisualPageInventoryEntry[]) => void>();
  private readonly pageThumbnailListeners = new Set<(thumbnail: VisualPageThumbnail) => void>();
  private readonly pageThumbnailFailureListeners = new Set<(failure: VisualPageThumbnailFailure) => void>();
  private pageLayoutRevision = 0;
  private pageInventoryFingerprint = '';
  private pendingPageInventory: VisualPageInventoryEntry[] | null = null;
  private selectedPage: InternalPageSelection | null = null;
  private blankPageInput: HTMLTextAreaElement | null = null;
  private suppressChanges = false;
  private visualMotionTimer: number | null = null;
  private transactionPending = false;
  private transactionCommitCallback: (() => void) | null = null;
  private transactionSafetyTimer: number | null = null;
  private readonly pendingHistoryActions: Array<'undo' | 'redo'> = [];

  constructor(
    private readonly visual: VisualMarkdownEditor & {
      on(event: string, listener: (...args: unknown[]) => void): void;
      canUndo?(): boolean;
      canRedo?(): boolean;
      flushPendingChanges?(): boolean;
      undo(): void;
      redo(): void;
      removeTopLevelBlocks(indices: number[]): boolean;
      insertTopLevelBlock?(index: number, state: unknown): boolean;
      insertTopLevelBlocks?(index: number, states: unknown[], focusIndex: number): boolean;
      getState?(): unknown[];
      replaceTopLevelBlocks?(
        index: number,
        deleteCount: number,
        states: unknown[],
        focusIndex?: number,
      ): boolean;
      updateLmxDirectiveMetadata?(
        path: Array<string | number>,
        patch: LmxBlockMetadataPatch,
      ): boolean;
    },
    private readonly source: CodeMirrorSourceEditor,
    private readonly visualContainer: HTMLElement,
    private readonly sourceContainer: HTMLElement,
  ) {
    this.modeController = new EditorModeController(visual, source);
    // Muya commits typing, structural edits, and history actions through
    // `json-change`. Listening at this boundary reports exactly one document
    // revision after canonical state is current; `content-change` fires before
    // that commit and misses add/delete/move entirely.
    visual.on('json-change', () => {
      this.clearPageSelection();
      this.visualContainer.dispatchEvent(new Event('visual-page-content-changed'));
      this.emitChange();
    });
    visual.on('lmx-block-selected', (value) => {
      if (!isLmxBlockSelection(value)) return;
      this.lmxSelectionListeners.forEach((listener) => listener(value));
    });
    source.onChange(() => this.emitChange());
    visualContainer.addEventListener('keydown', (event) => this.handleVisualHistoryShortcut(event));
    visualContainer.addEventListener('click', (event) => this.handleVisualPageSelection(event));
    visualContainer.addEventListener('input', (event) => {
      if (event.target !== this.blankPageInput) this.clearPageSelection();
    }, true);
    visualContainer.addEventListener('visual-page-inventory-changed', (event) => {
      const pages = (event as CustomEvent<VisualPageInventoryEntry[]>).detail;
      if (!Array.isArray(pages)) return;
      const fingerprint = JSON.stringify(pages.map((page) => ({
        pageIndex: page.pageIndex,
        kind: page.kind,
        semanticName: page.semanticName,
        blockIndices: page.blockIndices,
        deletable: page.deletable,
      })));
      if (fingerprint !== this.pageInventoryFingerprint) {
        this.pageInventoryFingerprint = fingerprint;
        this.pendingPageInventory = pages;
      }
    });
    visualContainer.addEventListener('visual-page-thumbnail-changed', (event) => {
      const thumbnail = (event as CustomEvent<VisualPageThumbnail>).detail;
      if (!thumbnail || thumbnail.layoutRevision !== this.pageLayoutRevision) return;
      this.pageThumbnailListeners.forEach((listener) => listener(thumbnail));
    });
    visualContainer.addEventListener('visual-page-thumbnail-failed', (event) => {
      const failure = (event as CustomEvent<VisualPageThumbnailFailure>).detail;
      if (!failure || failure.layoutRevision !== this.pageLayoutRevision) return;
      this.pageThumbnailFailureListeners.forEach((listener) => listener(failure));
    });
    visualContainer.addEventListener(VISUAL_PAGE_LAYOUT_COMMITTED, () => {
      this.pageLayoutRevision += 1;
      visualContainer.dataset.pageLayoutRevision = String(this.pageLayoutRevision);
      if (this.pendingPageInventory) {
        const inventory = this.pendingPageInventory;
        this.pendingPageInventory = null;
        this.pageInventoryListeners.forEach((listener) => listener(inventory));
      }
      if (!this.transactionPending) return;
      if (this.transactionSafetyTimer !== null) {
        window.clearTimeout(this.transactionSafetyTimer);
        this.transactionSafetyTimer = null;
      }
      const callback = this.transactionCommitCallback;
      this.transactionPending = false;
      this.transactionCommitCallback = null;
      delete this.visualContainer.dataset.pageTransaction;
      callback?.();
      const pendingHistoryAction = this.pendingHistoryActions.shift();
      if (pendingHistoryAction) {
        queueMicrotask(() => {
          if (pendingHistoryAction === 'undo') this.undo();
          else this.redo();
        });
      }
    });
    this.applyVisibility('visual');
  }

  get mode(): EditorMode {
    return this.modeController.mode;
  }

  setContent(markdown: string): void {
    this.clearPageSelection();
    const result = this.withSuppressedChanges(() => this.modeController.loadMarkdown(markdown));
    this.applyVisibility(this.mode);
    this.emitModeChange('visual', result.ok, result.diagnostics);
  }

  replaceContent(markdown: string, options: { animate?: boolean } = {}): void {
    this.clearPageSelection();
    const result = this.modeController.loadMarkdown(markdown);
    this.applyVisibility(this.mode);
    if (options.animate && result.ok) this.startVisualMotion('insert');
    this.emitModeChange('visual', result.ok, result.diagnostics);
    this.emitChange();
  }

  replaceMarkdownPreservingMode(markdown: string): void {
    this.commitPendingChanges();
    this.modeController.replaceMarkdownPreservingMode(markdown);
  }

  replaceTopLevelBlock(index: number, state: unknown): boolean {
    if (
      this.mode !== 'visual'
      || !this.visual.replaceTopLevelBlocks
      || this.transactionPending
      || !Number.isInteger(index)
      || index < 0
    ) return false;
    this.visual.flushPendingChanges?.();
    this.beginPageTransaction(() => {
      const block = this.topLevelBlocks()[index];
      this.startVisualMotion('insert', block ? [block] : []);
    });
    const replaced = this.visual.replaceTopLevelBlocks(index, 1, [state], -1);
    if (!replaced) {
      this.cancelPageTransaction();
      return false;
    }
    this.clearPageSelection();
    return true;
  }

  getMarkdown(): string {
    return this.modeController.getMarkdown();
  }

  commitPendingChanges(): void {
    this.visual.flushPendingChanges?.();
  }

  replaceAllTopLevelBlocks(states: unknown[]): boolean {
    if (
      this.mode !== 'visual'
      || this.transactionPending
      || !this.visual.getState
      || !this.visual.replaceTopLevelBlocks
      || states.length === 0
    ) return false;
    this.visual.flushPendingChanges?.();
    const currentState = this.visual.getState();
    if (currentState.length === 0) return false;
    this.beginPageTransaction(() => {
      this.startVisualMotion('insert', this.topLevelBlocks());
    });
    const replaced = this.visual.replaceTopLevelBlocks(0, currentState.length, states, -1);
    if (!replaced) {
      this.cancelPageTransaction();
      return false;
    }
    this.clearPageSelection();
    return true;
  }

  insertTextAtSelection(text: string): boolean {
    if (text.length === 0) return false;
    if (this.mode === 'source') {
      const { from, to } = this.source.getSelection();
      return this.source.replaceRanges([{ from, to }], text);
    }
    if (this.blankPageInput) return this.commitBlankPageInput(text);
    if (this.selectedPage?.kind === 'semantic'
      && !this.blocksForPage(this.selectedPage.pageIndex).some(block => this.editableContent(block))) {
      return false;
    }
    const selection = window.getSelection();
    const anchorInVisual = selection?.anchorNode
      && this.visualContainer.contains(selection.anchorNode)
      && !(selection.anchorNode instanceof Element
        ? selection.anchorNode.closest('[contenteditable="false"]')
        : selection.anchorNode.parentElement?.closest('[contenteditable="false"]'));
    if (!anchorInVisual) {
      const editableBlocks = this.topLevelBlocks().filter((block) => this.editableContent(block));
      const lastEditable = editableBlocks.at(-1);
      if (lastEditable) {
        this.focusEditableBlock(lastEditable, false);
      } else {
        this.visualContainer.focus();
      }
    } else {
      this.visualContainer.focus();
    }
    return document.execCommand('insertText', false, text);
  }

  on(event: string, listener: () => void): void {
    if (event === 'content-change') this.changeListeners.add(listener);
  }

  onLmxBlockSelected(listener: (selection: LmxBlockSelection) => void): void {
    this.lmxSelectionListeners.add(listener);
  }

  updateLmxBlockMetadata(
    path: Array<string | number>,
    patch: LmxBlockMetadataPatch,
  ): boolean {
    if (this.mode !== 'visual' || !this.visual.updateLmxDirectiveMetadata) return false;
    const updated = this.visual.updateLmxDirectiveMetadata(path, patch);
    if (!updated) return false;
    this.visual.flushPendingChanges?.();
    return true;
  }

  onPageSelectionChange(listener: (selection: VisualPageSelection | null) => void): void {
    this.pageSelectionListeners.add(listener);
  }

  onPageInventoryChange(listener: (pages: VisualPageInventoryEntry[]) => void): void {
    this.pageInventoryListeners.add(listener);
  }

  onPageThumbnailChange(listener: (thumbnail: VisualPageThumbnail) => void): void {
    this.pageThumbnailListeners.add(listener);
  }

  onPageThumbnailFailure(listener: (failure: VisualPageThumbnailFailure) => void): void {
    this.pageThumbnailFailureListeners.add(listener);
  }

  setPageNavigatorDemand(demand: PageNavigatorDemand): void {
    this.visualContainer.dispatchEvent(new CustomEvent('visual-page-navigator-demand-changed', {
      detail: demand,
    }));
  }

  revealLocation(location: DocumentSourceRange): boolean {
    if (this.mode === 'source') return this.source.revealRange(location.from, location.to);
    const markdown = this.getMarkdown();
    if (!Number.isInteger(location.from) || !Number.isInteger(location.to)
      || location.from < 0 || location.to < location.from || location.to > markdown.length) return false;
    const parsed = parseFrontMatter(markdown);
    if (!parsed.valid) return false;
    // Index only document content, but retain the exact UTF-16 source offset
    // of its prefix (including CRLF and legacy /{ front matter). Titles are
    // not identities: repeated titles and formatted links are both valid.
    const bodyOffset = markdown.length - parsed.body.length;
    const outline = createDocumentIndex(parsed.body).outline;
    const ordinal = outline.findIndex(entry => (
      entry.sourceRange.from + bodyOffset === location.from
      && entry.sourceRange.to + bodyOffset === location.to
    ));
    if (ordinal < 0) return false;
    const headings = [...this.visualContainer.querySelectorAll<HTMLElement>('.mu-atx-heading')]
      .filter(element => !element.closest('.mu-frontmatter, .mu-blockquote, .mu-list'));
    const heading = headings[ordinal];
    if (!heading) return false;
    this.clearPageSelection();
    const blocks = this.topLevelBlocks();
    const blockIndex = blocks.findIndex(block => block === heading || block.contains(heading));
    const page = this.getPageInventory().find(entry => entry.blockIndices.includes(blockIndex));
    if (page) this.selectPageInternal({ ...page, blockIndices: page.blockIndices });
    if (!this.focusEditableBlock(heading, true)) return false;
    // No synthetic click: Muya interprets clicks using the *old* selection.
    heading.scrollIntoView({ behavior: 'auto', block: 'center' });
    return true;
  }

  getPageInventory(): VisualPageInventoryEntry[] {
    return deriveVisualPageInventory(this.visualContainer);
  }

  selectPage(pageIndex: number): boolean {
    if (this.mode !== 'visual' || !Number.isInteger(pageIndex) || pageIndex < 0) return false;
    const pages = this.getPageInventory();
    const page = pages[pageIndex];
    if (!page) return false;
    const style = getComputedStyle(this.visualContainer);
    const pageHeight = cssPixelValue(style.getPropertyValue('--visual-page-height'));
    const pageGap = cssPixelValue(style.getPropertyValue('--visual-page-gap'));
    const slotHeight = pageHeight + pageGap;
    const stage = this.visualContainer.closest<HTMLElement>('.editor-stage');
    if (stage && slotHeight > 0 && typeof stage.scrollTo === 'function') {
      const stageRect = stage.getBoundingClientRect();
      const editorRect = this.visualContainer.getBoundingClientRect();
      const zoom = this.visualContainer.offsetWidth > 0
        ? editorRect.width / this.visualContainer.offsetWidth
        : 1;
      stage.scrollTo({
        top: stage.scrollTop + editorRect.top - stageRect.top + pageIndex * slotHeight * zoom,
        behavior: 'auto',
      });
    }
    this.selectPageInternal({ ...page, blockIndices: page.blockIndices });
    this.focusPage(page);
    return true;
  }

  addPage(afterPageIndex: number): boolean {
    if (this.mode !== 'visual' || this.transactionPending || !this.visual.insertTopLevelBlocks) return false;
    this.visual.flushPendingChanges?.();
    const pages = this.getPageInventory();
    const page = pages[afterPageIndex];
    if (!page) return false;
    this.beginPageTransaction(() => {
      this.startVisualMotion('insert', this.blocksForPage(afterPageIndex + 1));
    });
    const pageBreak = {
      name: 'lmx-directive',
      meta: { name: 'pagebreak', attributes: {} },
      children: [{ name: 'paragraph', text: '' }],
    };
    const states = page.kind === 'blank'
      && page.pageIndex > 0
      && page.blockIndices.length === 0
      ? [pageBreak, pageBreak, { name: 'paragraph', text: '' }]
      : [pageBreak, { name: 'paragraph', text: '' }];
    const inserted = this.visual.insertTopLevelBlocks(
      page.insertAfterIndex + 1,
      states,
      states.length - 1,
    );
    if (!inserted) {
      this.cancelPageTransaction();
      return false;
    }
    this.clearPageSelection();
    return true;
  }

  deletePage(pageIndex: number): boolean {
    if (
      this.mode !== 'visual'
      || this.transactionPending
      || !this.visual.getState
      || !Number.isInteger(pageIndex)
      || pageIndex < 0
    ) return false;
    this.visual.flushPendingChanges?.();
    const inventory = this.getPageInventory();
    const deleteIndices = createPageDeletePlan(inventory, this.visual.getState(), pageIndex);
    if (!deleteIndices) return false;
    this.beginPageTransaction(() => {
      this.startVisualMotion('delete', this.blocksForPage(Math.max(0, pageIndex - 1)));
    });
    const deleted = this.visual.removeTopLevelBlocks(deleteIndices);
    if (!deleted) {
      this.cancelPageTransaction();
      return false;
    }
    this.clearPageSelection();
    return true;
  }

  movePage(pageIndex: number, direction: PageMoveDirection): boolean {
    if (
      this.mode !== 'visual'
      || this.transactionPending
      || !this.visual.getState
      || !this.visual.replaceTopLevelBlocks
      || !Number.isInteger(pageIndex)
      || (direction !== 'up' && direction !== 'down')
    ) return false;

    this.visual.flushPendingChanges?.();
    const inventory = this.getPageInventory();
    const states = this.visual.getState();
    const plan = createMoveIntoBlankPagePlan(inventory, states, pageIndex, direction)
      ?? createAdjacentPageMovePlan(inventory, states, pageIndex, direction);
    if (!plan) return false;
    const adjacentPageIndex = plan.destinationPageIndex;
    const oldBlocks = [
      ...this.motionBlocksForPage(pageIndex),
      ...this.motionBlocksForPage(adjacentPageIndex),
    ];
    const oldPositions = oldBlocks.map((block) => block.getBoundingClientRect().top);
    const editorRect = this.visualContainer.getBoundingClientRect();
    const renderedScale = this.visualContainer.offsetWidth > 0
      ? editorRect.width / this.visualContainer.offsetWidth
      : 1;
    this.beginPageTransaction(() => {
      const newBlocks = [
        ...this.motionBlocksForPage(plan.destinationPageIndex),
        ...this.motionBlocksForPage(pageIndex),
      ];
      newBlocks.forEach((block, index) => {
        const oldTop = oldPositions[index];
        if (oldTop === undefined) return;
        const delta = (oldTop - block.getBoundingClientRect().top) / renderedScale;
        block.style.setProperty('--page-motion-offset-y', `${delta}px`);
      });
      this.startVisualMotion('move', newBlocks);
      const destination = this.getPageInventory()[plan.destinationPageIndex];
      if (destination) this.selectPageInternal({ ...destination, blockIndices: destination.blockIndices });
    });
    const moved = this.visual.replaceTopLevelBlocks(
      plan.startIndex,
      plan.deleteCount,
      plan.replacement,
      plan.focusIndex,
    );
    if (!moved) {
      this.cancelPageTransaction();
      return false;
    }

    this.clearPageSelection();
    return true;
  }

  private contentRoot(): HTMLElement | null {
    return [...this.visualContainer.children].find((element): element is HTMLElement => (
      element instanceof HTMLElement && element.classList.contains('mu-container')
    )) ?? null;
  }

  private topLevelBlocks(): HTMLElement[] {
    const contentRoot = this.contentRoot();
    return contentRoot
      ? [...contentRoot.children].filter((element): element is HTMLElement => element instanceof HTMLElement)
      : [];
  }

  private blocksForPage(pageIndex: number): HTMLElement[] {
    const page = this.getPageInventory()[pageIndex];
    if (!page) return [];
    const blocks = this.topLevelBlocks();
    return page.blockIndices.flatMap((index) => blocks[index] ? [blocks[index]] : []);
  }

  private motionBlocksForPage(pageIndex: number): HTMLElement[] {
    return this.blocksForPage(pageIndex).filter((block) => block.dataset.lmxName !== 'pagebreak');
  }

  private beginPageTransaction(onCommit: () => void): void {
    if (this.transactionSafetyTimer !== null) {
      window.clearTimeout(this.transactionSafetyTimer);
    }
    this.transactionPending = true;
    this.transactionCommitCallback = onCommit;
    this.visualContainer.dataset.pageTransaction = 'pending';
    this.visualContainer.dispatchEvent(new Event(VISUAL_PAGE_TRANSACTION_START));
    this.transactionSafetyTimer = window.setTimeout(() => {
      this.transactionSafetyTimer = null;
      if (!this.transactionPending) return;
      const callback = this.transactionCommitCallback;
      this.transactionPending = false;
      this.transactionCommitCallback = null;
      delete this.visualContainer.dataset.pageTransaction;
      callback?.();
    }, 220);
  }

  private cancelPageTransaction(): void {
    if (this.transactionSafetyTimer !== null) {
      window.clearTimeout(this.transactionSafetyTimer);
      this.transactionSafetyTimer = null;
    }
    this.transactionPending = false;
    this.transactionCommitCallback = null;
    delete this.visualContainer.dataset.pageTransaction;
  }

  private startVisualMotion(kind: 'insert' | 'delete' | 'move', blocks: HTMLElement[] = []): void {
    if (this.visualMotionTimer !== null) window.clearTimeout(this.visualMotionTimer);
    this.visualContainer.dataset.visualMotion = kind;
    this.visualContainer.querySelectorAll<HTMLElement>('[data-page-motion]').forEach((block) => {
      delete block.dataset.pageMotion;
    });
    for (const block of blocks) block.dataset.pageMotion = kind;
    this.visualMotionTimer = window.setTimeout(() => {
      this.visualContainer.querySelectorAll<HTMLElement>('[data-page-motion]').forEach((block) => {
        delete block.dataset.pageMotion;
        block.style.removeProperty('--page-motion-offset-y');
      });
      this.visualMotionTimer = null;
    }, 260);
  }

  onModeChange(listener: (transition: EditorModeTransition) => void): void {
    this.modeChangeListeners.add(listener);
  }

  showSource(): DocumentDiagnostic[] {
    this.visual.flushPendingChanges?.();
    this.clearPageSelection();
    const result = this.modeController.showSource();
    this.applyVisibility('source');
    this.source.focus();
    this.emitModeChange('source', result.ok, result.diagnostics);
    return result.diagnostics;
  }

  showVisual(): DocumentDiagnostic[] {
    const result = this.withSuppressedChanges(() => this.modeController.showVisual());
    if (result.ok) this.applyVisibility('visual');
    this.emitModeChange('visual', result.ok, result.diagnostics);
    return result.diagnostics;
  }

  setMode(mode: EditorMode): void {
    if (mode === 'source') {
      this.showSource();
    } else {
      this.showVisual();
    }
  }

  undo(): void {
    if (this.mode !== 'visual') return;
    if (this.transactionPending) {
      this.pendingHistoryActions.push('undo');
      return;
    }
    this.visual.flushPendingChanges?.();
    if (this.visual.canUndo?.() !== true) return;
    this.beginPageTransaction(() => this.clearPageSelection());
    this.visual.undo();
  }

  redo(): void {
    if (this.mode !== 'visual') return;
    if (this.transactionPending) {
      this.pendingHistoryActions.push('redo');
      return;
    }
    this.visual.flushPendingChanges?.();
    if (this.visual.canRedo?.() !== true) return;
    this.beginPageTransaction(() => this.clearPageSelection());
    this.visual.redo();
  }

  deleteSelectedPage(): boolean {
    if (this.mode !== 'visual' || !this.selectedPage?.deletable) return false;
    return this.deletePage(this.selectedPage.pageIndex);
  }

  focusTopLevelBlock(index: number): boolean {
    const block = this.topLevelBlocks()[index];
    if (!block) return false;
    if (block.getAttribute('contenteditable') === 'false') {
      block.focus();
      return document.activeElement === block;
    }
    return this.focusEditableBlock(block);
  }

  focusLastLmxBlock(name: string): boolean {
    const blocks = Array.from(
      this.visualContainer.querySelectorAll<HTMLElement>('[data-lmx-name]'),
    ).filter((block) => block.dataset.lmxName === name);
    const block = blocks.at(-1);
    if (!block) return false;

    if (block.getAttribute('contenteditable') === 'false') {
      block.focus();
      return document.activeElement === block;
    }

    const content = block.querySelector<HTMLElement>('[contenteditable="true"]');
    if (!content) {
      if (block.tabIndex < 0) return false;
      block.focus();
      return document.activeElement === block;
    }

    content.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  }

  private editableContent(block: HTMLElement | undefined): HTMLElement | null {
    if (!block || block.hidden || block.closest('[contenteditable="false"]')) return null;
    const content = block.matches('[contenteditable="true"]')
      ? block
      : block.querySelector<HTMLElement>('[contenteditable="true"]');
    return content?.isConnected && !content.closest('[contenteditable="false"], [hidden]') ? content : null;
  }

  private focusEditableBlock(block: HTMLElement | undefined, atStart = false): boolean {
    const content = this.editableContent(block);
    if (!content) return false;
    content.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(atStart);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return content.contains(selection?.anchorNode ?? null);
  }

  private focusPage(page: VisualPageInventoryEntry): void {
    this.removeBlankPageInput();
    const blocks = this.topLevelBlocks();
    const editable = page.blockIndices.map(index => blocks[index])
      .find(block => this.editableContent(block));
    if (editable) {
      this.focusEditableBlock(editable, true);
      return;
    }
    if (page.kind !== 'blank') {
      const atomic = page.blockIndices.map(index => blocks[index])
        .find(block => block?.getAttribute('contenteditable') === 'false');
      atomic?.focus({ preventScroll: true });
      window.getSelection()?.removeAllRanges();
      return;
    }

    // A derived blank sheet needs a caret but must not create a history entry
    // or silently alter Markdown on selection. This native input is transient,
    // outside Muya's canonical block tree; the first committed input creates
    // one real paragraph through Muya's existing undoable insertion API.
    const input = document.createElement('textarea');
    input.setAttribute('aria-label', `Nội dung trang ${page.pageIndex + 1}`);
    input.dataset.blankPageInput = String(page.pageIndex);
    input.rows = 1;
    const style = getComputedStyle(this.visualContainer);
    const slot = cssPixelValue(style.getPropertyValue('--visual-page-height'))
      + cssPixelValue(style.getPropertyValue('--visual-page-gap'));
    Object.assign(input.style, {
      position: 'absolute',
      top: `${page.pageIndex * slot + cssPixelValue(style.getPropertyValue('--visual-page-content-top'))}px`,
      left: 'var(--visual-page-content-left, 117px)',
      width: 'calc(100% - var(--visual-page-content-left, 117px) - var(--visual-page-content-right, 78px))',
      font: 'inherit', lineHeight: 'inherit', color: 'inherit', background: 'transparent',
      border: '0', padding: '0', margin: '0', resize: 'none', outline: 'none',
      zIndex: '1',
    });
    this.blankPageInput = input;
    input.addEventListener('input', event => {
      event.stopPropagation();
      if (!(event as InputEvent).isComposing) this.commitBlankPageInput(input.value);
    });
    input.addEventListener('compositionend', event => {
      event.stopPropagation();
      this.commitBlankPageInput(input.value);
    });
    for (const type of ['click', 'keyup', 'compositionstart']) {
      input.addEventListener(type, event => event.stopPropagation());
    }
    input.addEventListener('keydown', event => {
      // Keep text/IME events away from Muya's previous active block, but
      // preserve the surface's normal undo/redo routing.
      if (!(event.metaKey || event.ctrlKey)) event.stopPropagation();
    });
    this.visualContainer.append(input);
    // WebKit shares its text-control caret with the document Selection.
    // Clearing ranges *after* focus leaves an active textarea that cannot
    // receive native insertText. Clear the stale Muya caret first.
    window.getSelection()?.removeAllRanges();
    input.focus({ preventScroll: true });
    input.setSelectionRange(0, 0);
  }

  private commitBlankPageInput(text: string): boolean {
    if (!text || !this.blankPageInput || !this.selectedPage
      || this.transactionPending || !this.visual.insertTopLevelBlocks) return false;
    const page = this.getPageInventory()[this.selectedPage.pageIndex];
    if (!page || page.kind !== 'blank') return false;
    const blocks = this.topLevelBlocks();
    const style = getComputedStyle(this.visualContainer);
    const slot = cssPixelValue(style.getPropertyValue('--visual-page-height'))
      + cssPixelValue(style.getPropertyValue('--visual-page-gap'));
    const scale = this.visualContainer.offsetWidth > 0
      ? this.visualContainer.getBoundingClientRect().width / this.visualContainer.offsetWidth : 1;
    // A full-slot break ENDS the blank page. Inserting after it incorrectly
    // puts the caret on the following sheet. A zero-height boundary, in
    // contrast, opens this sheet and the paragraph belongs after it.
    const endingBreak = page.blockIndices.find(index => (
      blocks[index]?.dataset.lmxName === 'pagebreak'
      && blocks[index].getBoundingClientRect().height / scale >= slot - 2.5
    ));
    const index = endingBreak ?? page.insertAfterIndex + 1;
    this.visual.flushPendingChanges?.();
    this.beginPageTransaction(() => this.focusEditableBlock(this.topLevelBlocks()[index]));
    const inserted = this.visual.insertTopLevelBlocks(index, [{ name: 'paragraph', text }], 0);
    if (!inserted) {
      this.cancelPageTransaction();
      return false;
    }
    this.clearPageSelection();
    return true;
  }

  private removeBlankPageInput(): void {
    this.blankPageInput?.remove();
    this.blankPageInput = null;
  }

  private applyVisibility(mode: EditorMode): void {
    if (mode === 'visual') this.hideVisualMetadataBlocks();
    this.visualContainer.hidden = mode !== 'visual';
    this.sourceContainer.hidden = mode !== 'source';
  }

  private hideVisualMetadataBlocks(): void {
    this.visualContainer
      .querySelectorAll<HTMLElement>('[data-visual-metadata-hidden]')
      .forEach((metadataBlock) => {
        metadataBlock.hidden = false;
        delete metadataBlock.dataset.visualMetadataHidden;
      });

    this.visualContainer.querySelectorAll<HTMLElement>('.mu-frontmatter').forEach((frontMatter) => {
      frontMatter.hidden = true;
      frontMatter.dataset.visualMetadataHidden = 'true';
    });
    this.visualContainer.dispatchEvent(new Event('visual-metadata-visibility-changed'));
  }

  private emitChange(): void {
    if (!this.suppressChanges) this.changeListeners.forEach((listener) => listener());
  }

  private handleVisualHistoryShortcut(event: KeyboardEvent): void {
    if (this.mode !== 'visual' || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey);
    if (!isUndo && !isRedo) return;

    event.preventDefault();
    event.stopPropagation();
    if (isUndo) this.undo();
    else this.redo();
  }

  private handleVisualPageSelection(event: MouseEvent): void {
    const target = event.target;
    if (this.mode !== 'visual' || !(target instanceof Node)) return;
    const editorRect = this.visualContainer.getBoundingClientRect();
    const style = getComputedStyle(this.visualContainer);
    const pageHeight = cssPixelValue(style.getPropertyValue('--visual-page-height'));
    const pageGap = cssPixelValue(style.getPropertyValue('--visual-page-gap'));
    if (pageHeight <= 0) return;

    const slotHeight = pageHeight + pageGap;
    const scale = this.visualContainer.offsetWidth > 0
      ? editorRect.width / this.visualContainer.offsetWidth
      : 1;
    const renderedSlotHeight = slotHeight * scale;
    const offsetWithinEditor = event.clientY - editorRect.top;
    const pageIndex = Math.max(0, Math.floor(offsetWithinEditor / renderedSlotHeight));
    const offsetWithinSlot = offsetWithinEditor - pageIndex * renderedSlotHeight;
    if (offsetWithinSlot > pageHeight * scale) return;
    const contentRoot = this.contentRoot();
    if (!contentRoot) return;
    const blocks = [...contentRoot.children].filter((element): element is HTMLElement => (
      element instanceof HTMLElement
    ));
    const page = this.getPageInventory()[pageIndex];
    const pageTop = editorRect.top + pageIndex * renderedSlotHeight;
    const pageBottom = pageTop + pageHeight * scale;
    const hasEditableContent = blocks.some((block) => {
      if (block.hidden || block.closest('[contenteditable="false"]')) return false;
      const editable = block.matches('[contenteditable="true"]')
        ? block
        : block.querySelector<HTMLElement>('[contenteditable="true"]');
      if (!editable) return false;
      const rect = block.getBoundingClientRect();
      return rect.bottom > pageTop + 1 && rect.top < pageBottom - 1;
    });
    if (
      page
      && page.kind === 'blank'
      && !hasEditableContent
    ) {
      this.selectPageInternal({ ...page, blockIndices: page.blockIndices });
      this.focusPage(page);
      return;
    }
    const targetIndex = blocks.findIndex((block) => block === target || block.contains(target));
    const targetBlock = targetIndex >= 0 ? blocks[targetIndex] : undefined;
    const semanticName = targetBlock?.dataset.lmxName;

    if (targetBlock && semanticName === 'pagebreak') {
      const boundaryPage = this.getPageInventory()[pageIndex];
      if (boundaryPage) {
        this.selectPageInternal({ ...boundaryPage, blockIndices: boundaryPage.blockIndices });
      }
      return;
    }

    if (targetBlock && semanticName && isSemanticPageBlock(targetBlock)) {
      this.selectPageInternal({
        pageIndex,
        kind: 'semantic',
        blockCount: 1,
        semanticName,
        deletable: true,
        blockIndices: [targetIndex],
      });
      if (targetBlock.getAttribute('contenteditable') === 'false' && page) this.focusPage(page);
      return;
    }

    const blockIndices = blocks.flatMap((block, index) => {
      if (block.hidden || isSemanticPageBlock(block)) return [];
      const rect = block.getBoundingClientRect();
      return rect.bottom > pageTop + 1 && rect.top < pageBottom - 1 ? [index] : [];
    });
    this.selectPageInternal({
      pageIndex,
      kind: blockIndices.length > 0 ? 'content' : 'blank',
      blockCount: blockIndices.length,
      semanticName: null,
      deletable: blockIndices.length > 0,
      blockIndices,
    });
  }

  private selectPageInternal(selection: InternalPageSelection): void {
    this.selectedPage = selection;
    this.visualContainer.dataset.selectedPageIndex = String(selection.pageIndex);
    this.visualContainer.dispatchEvent(new Event('visual-page-selection-changed'));
    const publicSelection: VisualPageSelection = {
      pageIndex: selection.pageIndex,
      kind: selection.kind,
      blockCount: selection.blockCount,
      semanticName: selection.semanticName,
      deletable: selection.deletable,
    };
    this.pageSelectionListeners.forEach((listener) => listener(publicSelection));
  }

  private clearPageSelection(): void {
    this.removeBlankPageInput();
    if (!this.selectedPage && !this.visualContainer.hasAttribute('data-selected-page-index')) return;
    this.selectedPage = null;
    delete this.visualContainer.dataset.selectedPageIndex;
    this.visualContainer.dispatchEvent(new Event('visual-page-selection-changed'));
    this.pageSelectionListeners.forEach((listener) => listener(null));
  }

  private emitModeChange(
    requestedMode: EditorMode,
    accepted: boolean,
    diagnostics: DocumentDiagnostic[],
  ): void {
    const transition: EditorModeTransition = {
      mode: this.mode,
      requestedMode,
      accepted,
      diagnostics,
    };
    this.modeChangeListeners.forEach((listener) => listener(transition));
  }

  private withSuppressedChanges<T>(operation: () => T): T {
    this.suppressChanges = true;
    try {
      return operation();
    } finally {
      this.suppressChanges = false;
    }
  }
}

export interface LmxBlockSelection {
  name: string;
  identifier: string | null;
  attributes: Record<string, string | number | boolean>;
  path: Array<string | number>;
}

export interface LmxBlockMetadataPatch {
  identifier: string | null;
  attributes: Record<string, string | number | boolean>;
}

export interface VisualPageSelection {
  pageIndex: number;
  kind: 'semantic' | 'content' | 'blank';
  blockCount: number;
  semanticName: string | null;
  deletable: boolean;
}

interface InternalPageSelection extends VisualPageSelection {
  blockIndices: number[];
}

export interface EditorModeTransition {
  mode: EditorMode;
  requestedMode: EditorMode;
  accepted: boolean;
  diagnostics: DocumentDiagnostic[];
}

function isLmxBlockSelection(value: unknown): value is LmxBlockSelection {
  if (typeof value !== 'object' || value === null) return false;
  const selection = value as Record<string, unknown>;
  return typeof selection.name === 'string'
    && (typeof selection.identifier === 'string' || selection.identifier === null)
    && isLmxAttributeRecord(selection.attributes)
    && Array.isArray(selection.path)
    && selection.path.every((part) => typeof part === 'string' || Number.isInteger(part));
}

function isLmxAttributeRecord(value: unknown): value is LmxBlockSelection['attributes'] {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => (
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    ));
}

function cssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSemanticPageBlock(block: HTMLElement): boolean {
  return block.dataset.lmxName === 'cover'
    || block.dataset.lmxName === 'toc'
    || block.dataset.lmxName === 'list-of-figures'
    || block.dataset.lmxName === 'list-of-tables'
    || block.dataset.lmxName === 'front-section';
}
