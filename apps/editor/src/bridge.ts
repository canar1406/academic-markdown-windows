import { createEnvelope, isSupportedEnvelope, type BridgeEnvelope } from '@markdown/bridge-protocol';
import { exportMarkdownToLatex } from '@markdown/latex-exporter';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { installHostTransport, postToHost } from './host-transport';
export { postToHost } from './host-transport';
import { projectThemeSceneToMarkdown } from './studio-preview';
import { applyAuthoredThemeToMarkdown } from './authored-theme-application';
import { installStudioInteractions } from './studio-interactions';
import {
  createDocumentIndex,
  hasQuickStyleOverride,
  parseFrontMatter,
  updateDocumentComponentTheme,
  updateFrontMatter,
  type DocumentSourceRange,
} from '@markdown/document-core';
import {
  EDITOR_CONTENT_LOADED,
  MATH_TYPE_PREFERENCE_CHANGED,
} from './math-preferences';
import type { LmxBlockMetadataPatch, LmxBlockSelection } from './editor-surface';
import {
  VISUAL_PAGE_ADD_REQUESTED,
  VISUAL_PAGE_DELETE_REQUESTED,
  VISUAL_PAGE_MOVE_REQUESTED,
  type VisualPageAddRequest,
  type VisualPageDeleteRequest,
  type VisualPageMoveRequest,
} from './page-action-strip';

const MAX_DROPPED_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME = /^image\/(?:png|jpe?g|gif|webp|svg\+xml)$/i;
const MIN_THUMBNAIL_WIDTH = 64;
const MAX_THUMBNAIL_WIDTH = 320;

export interface PageNavigatorDemand {
  pageIndices: number[];
  targetWidth: number;
}
export type SearchAction = 'open' | 'next' | 'previous' | 'replace' | 'replaceAll' | 'close';

declare global {
  interface Window {
    markdownEditor?: {
      loadMarkdown(markdown: string): void;
      requestMarkdown(requestId: string): void;
      requestLatex(requestId: string): void;
      requestMetadata(requestId: string): void;
      updateMetadata(patch: Record<string, unknown>, requestId?: string): void;
      setMode(mode: 'visual' | 'source'): void;
      deleteSelectedPage(): void;
      selectPage(pageIndex: number): void;
      addPage(afterPageIndex: number): void;
      deletePage(pageIndex: number): void;
      movePage(pageIndex: number, direction: 'up' | 'down'): boolean;
      setZoom(magnification: number, pageIndex?: number | null, interactive?: boolean): void;
      setMathTypeEnabled(enabled: boolean): void;
      revealLocation(location: DocumentSourceRange): void;
      setPageNavigatorDemand(demand: PageNavigatorDemand): void;
      search(action: SearchAction): void;
      handleEnvelope(envelope: BridgeEnvelope): void;
    };
  }
}

function applyStudioReadOnly(container: HTMLElement): void {
  if (container.getAttribute('contenteditable') === 'true') container.setAttribute('contenteditable', 'false');
  container.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach(element => element.setAttribute('contenteditable', 'false'));
}

function installStudioReadOnly(container?: HTMLElement): (() => void) | null {
  if (!container) return null;
  const sourceButton = document.querySelector<HTMLElement>('#mode-source');
  const previousSourceHidden = sourceButton?.hidden;
  if (sourceButton) sourceButton.hidden = true;
  const observer = new MutationObserver(() => applyStudioReadOnly(container));
  applyStudioReadOnly(container);
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable'] });
  const mutatingEvents = ['beforeinput', 'paste', 'cut', 'drop'] as const;
  const stopMutation = (event: Event): void => { event.preventDefault(); event.stopPropagation(); };
  mutatingEvents.forEach(type => container.addEventListener(type, stopMutation, true));
  const navigationKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab', 'Escape']);
  const stopEditingKeys = (event: KeyboardEvent): void => {
    if (navigationKeys.has(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) return;
    const mutationKey = ['Backspace', 'Delete', 'Enter'].includes(event.key)
      || (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1)
      || ((event.metaKey || event.ctrlKey) && ['a', 'v', 'x', 'z', 'y'].includes(event.key.toLowerCase()));
    if (mutationKey) stopMutation(event);
  };
  container.addEventListener('keydown', stopEditingKeys, true);
  return () => {
    observer.disconnect();
    mutatingEvents.forEach(type => container.removeEventListener(type, stopMutation, true));
    container.removeEventListener('keydown', stopEditingKeys, true);
    if (sourceButton && previousSourceHidden !== undefined) sourceButton.hidden = previousSourceHidden;
  };
}

export function installBridge(editor: {
  setContent(content: string, autoFocus?: boolean): void;
  replaceMarkdownPreservingMode?(content: string): void;
  commitPendingChanges?(): void;
  getMarkdown(): string;
  on(event: string, listener: () => void): void;
  onLmxBlockSelected?(listener: (selection: LmxBlockSelection) => void): void;
  updateLmxBlockMetadata?(path: Array<string | number>, patch: LmxBlockMetadataPatch): boolean;
  onPageSelectionChange?(listener: (selection: {
    pageIndex: number;
    kind: 'semantic' | 'content' | 'blank';
    blockCount: number;
    semanticName: string | null;
    deletable: boolean;
  } | null) => void): void;
  onPageInventoryChange?(listener: (pages: Array<{
    pageIndex: number;
    kind: 'semantic' | 'content' | 'blank';
    semanticName: string | null;
    blockCount: number;
    deletable: boolean;
    title: string;
  }>) => void): void;
  onPageThumbnailChange?(listener: (thumbnail: {
    layoutRevision: number;
    pageIndex: number;
    mimeType: 'image/png' | 'image/jpeg';
    dataBase64: string;
  }) => void): void;
  onPageThumbnailFailure?(listener: (failure: {
    layoutRevision: number;
    pageIndex: number;
    targetWidth: number;
    message: string;
  }) => void): void;
  onModeChange?(listener: (transition: {
    mode: 'visual' | 'source';
    requestedMode: 'visual' | 'source';
    accepted: boolean;
  }) => void): void;
  setMode?(mode: 'visual' | 'source'): void;
  insertTextAtSelection?(text: string): boolean;
  deleteSelectedPage?(): boolean;
  selectPage?(pageIndex: number): boolean;
  addPage?(afterPageIndex: number): boolean;
  deletePage?(pageIndex: number): boolean;
  movePage?(pageIndex: number, direction: 'up' | 'down'): boolean;
  getState?(): unknown[];
  replaceTopLevelBlocks?(
    index: number,
    deleteCount: number,
    states: unknown[],
    focusIndex?: number,
  ): boolean;
  setZoom?(magnification: number, pageIndex?: number | null, interactive?: boolean): boolean;
  revealLocation?(location: DocumentSourceRange): boolean;
  setPageNavigatorDemand?(demand: PageNavigatorDemand): void;
  visualContainer?: HTMLElement;
  search?(action: SearchAction): void;
  resetSearch?(): void;
}): void {
  let revision = 0;
  let studioReadOnly: (() => void) | null = null;
  let studioReadOnlyActive = false;
  let studioRenderGeneration = 0;
  let disposeStudioInteractions: (() => void) | null = null;
  let studioRequestId: string | null = null;
  let studioSelectedId: string | null = null;
  const markStudioSelection = (): void => {
    editor.visualContainer?.querySelectorAll<HTMLElement>('[data-authored-node-id]').forEach(node => {
      node.dataset.authoredSelected = String(node.dataset.authoredNodeId === studioSelectedId);
    });
  };
  editor.visualContainer?.addEventListener('click', event => {
    if (!studioReadOnlyActive || !studioRequestId || !(event.target instanceof Element)) return;
    const node = event.target.closest<HTMLElement>('[data-authored-node-id]');
    if (!node?.dataset.authoredNodeId || !editor.visualContainer?.contains(node)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    studioSelectedId = node.dataset.authoredNodeId;
    markStudioSelection();
    postToHost(createEnvelope('studio.nodeSelected', studioRequestId, { nodeId: studioSelectedId }));
  }, true);
  let metadataState = readMetadataState(editor.getMarkdown());
  const pendingImageDrops = new Map<string, (relativePath: string | null) => void>();

  const postMetadataChangeIfNeeded = (force = false): void => {
    const nextState = readMetadataState(editor.getMarkdown());
    if (!force && nextState.signature === metadataState.signature) return;
    metadataState = nextState;
    postToHost(createEnvelope('document.metadataChanged', null, {
      revision,
      valid: nextState.valid,
    }));
  };

  const recordDocumentChange = (): void => {
    revision += 1;
    postToHost(createEnvelope('document.indexInvalidated', null, {
      documentRevision: revision,
      facets: ['outline', 'links', 'images', 'diagnostics'],
    }));
    postToHost(createEnvelope('document.changed', null, { revision }));
    postToHost(createEnvelope('document.indexChanged', null, createDocumentIndex(
      editor.getMarkdown(),
      revision,
    ) as unknown as Record<string, unknown>));
    postMetadataChangeIfNeeded();
  };

  window.markdownEditor = {
    loadMarkdown(markdown: string): void {
      editor.resetSearch?.();
      editor.setContent(markdown, true);
      editor.visualContainer?.dispatchEvent(new Event(EDITOR_CONTENT_LOADED));
      revision = 0;
      postToHost(createEnvelope('document.indexChanged', null, createDocumentIndex(
        editor.getMarkdown(),
        revision,
      ) as unknown as Record<string, unknown>));
      postMetadataChangeIfNeeded(true);
    },
    requestMarkdown(requestId: string): void {
      editor.commitPendingChanges?.();
      const markdown = editor.getMarkdown();
      const sourceRevision = revision;
      postToHost(createEnvelope('document.markdown', requestId, {
        markdown,
        revision: sourceRevision,
      }));
    },
    requestLatex(requestId: string): void {
      editor.commitPendingChanges?.();
      const source = editor.getMarkdown();
      const sourceRevision = revision;
      const result = exportMarkdownToLatex(source, hcmutReportTheme);
      postToHost(createEnvelope('export.latex', requestId, {
        latex: result.latex,
        diagnostics: result.diagnostics,
        assetPaths: result.assetPaths,
        revision: sourceRevision,
      }));
    },
    requestMetadata(requestId: string): void {
      const parsed = parseFrontMatter(editor.getMarkdown());
      postToHost(createEnvelope('document.metadata', requestId, {
        data: parsed.data,
        valid: parsed.valid,
        diagnostics: parsed.diagnostics,
      }));
    },
    updateMetadata(patch: Record<string, unknown>, requestId?: string): void {
      if (studioReadOnlyActive) {
        postToHost(createEnvelope('document.metadata.updated', requestId ?? null, {
          updated: false,
          diagnostics: [{ message: 'Theme Studio preview is read-only.', severity: 'warning' }],
        }));
        return;
      }
      const result = updateFrontMatter(editor.getMarkdown(), patch);
      if (result.updated) {
        editor.setContent(result.source, true);
        recordDocumentChange();
      }
      postToHost(createEnvelope('document.metadata.updated', requestId ?? null, {
        updated: result.updated,
        diagnostics: result.diagnostics,
      }));
    },
    setMode(mode: 'visual' | 'source'): void {
      if (studioReadOnlyActive && mode === 'source') return;
      editor.setMode?.(mode);
    },
    search(action: SearchAction): void {
      editor.search?.(action);
    },
    deleteSelectedPage(): void {
      editor.deleteSelectedPage?.();
    },
    selectPage(pageIndex: number): void {
      if (Number.isInteger(pageIndex)) editor.selectPage?.(pageIndex);
    },
    addPage(afterPageIndex: number): void {
      if (Number.isInteger(afterPageIndex)) editor.addPage?.(afterPageIndex);
    },
    deletePage(pageIndex: number): void {
      if (Number.isInteger(pageIndex)) editor.deletePage?.(pageIndex);
    },
    movePage(pageIndex: number, direction: 'up' | 'down'): boolean {
      if (Number.isInteger(pageIndex) && (direction === 'up' || direction === 'down')) {
        return editor.movePage?.(pageIndex, direction) ?? false;
      }
      return false;
    },
    setZoom(magnification: number, pageIndex?: number | null, interactive = false): void {
      editor.setZoom?.(magnification, pageIndex, interactive);
    },
    setMathTypeEnabled(enabled: boolean): void {
      editor.visualContainer?.dispatchEvent(new CustomEvent(MATH_TYPE_PREFERENCE_CHANGED, {
        detail: { enabled },
      }));
    },
    revealLocation(location: DocumentSourceRange): void {
      editor.revealLocation?.(location);
    },
    setPageNavigatorDemand(demand: PageNavigatorDemand): void {
      editor.setPageNavigatorDemand?.(demand);
    },
    handleEnvelope(envelope: BridgeEnvelope): void {
      if (!isSupportedEnvelope(envelope)) return;

      switch (envelope.type) {
        case 'studio.selectNode': {
          if (!studioReadOnlyActive || envelope.requestId !== studioRequestId) break;
          const nodeId = envelope.payload.nodeId;
          if (typeof nodeId !== 'string' && nodeId !== null) break;
          studioSelectedId = nodeId;
          markStudioSelection();
          break;
        }
        case 'document.applyAuthoredTheme': {
          if (studioReadOnlyActive) {
            postToHost(createEnvelope('document.authoredTheme.updated', envelope.requestId, {
              updated: false, diagnostics: [{code:'theme.read-only',message:'Apply must target an editable report, not the Studio sample.',severity:'error'}],
            }));
            break;
          }
          editor.commitPendingChanges?.();
          const result = applyAuthoredThemeToMarkdown(editor.getMarkdown(), envelope.payload.snapshot);
          if (result.updated) {
            if (editor.replaceMarkdownPreservingMode) editor.replaceMarkdownPreservingMode(result.source);
            else editor.setContent(result.source, true);
            recordDocumentChange();
          }
          postToHost(createEnvelope('document.authoredTheme.updated', envelope.requestId, {
            updated: result.updated, diagnostics: result.diagnostics,
          }));
          break;
        }
        case 'document.loadMarkdown': {
          const markdown = envelope.payload.markdown;
          if (typeof markdown === 'string') window.markdownEditor?.loadMarkdown(markdown);
          break;
        }
        case 'document.requestMarkdown':
          window.markdownEditor?.requestMarkdown(envelope.requestId ?? '');
          break;
        case 'export.requestLatex':
          window.markdownEditor?.requestLatex(envelope.requestId ?? '');
          break;
        case 'studio.previewScene': {
          const scene = envelope.payload.scene;
          const title = typeof envelope.payload.title === 'string'
            ? envelope.payload.title
            : 'Theme Studio sample';
          const result = projectThemeSceneToMarkdown(scene, title);
          if (result.markdown) {
            studioRequestId = envelope.requestId;
            studioSelectedId = typeof envelope.payload.selectedNodeId === 'string' ? envelope.payload.selectedNodeId : null;
            const stage = editor.visualContainer?.closest<HTMLElement>('.editor-stage');
            const top = studioReadOnlyActive ? stage?.scrollTop ?? 0 : 0;
            const left = studioReadOnlyActive ? stage?.scrollLeft ?? 0 : 0;
            const generation = ++studioRenderGeneration;
            studioReadOnly?.();
            disposeStudioInteractions?.();
            if (editor.visualContainer) disposeStudioInteractions = installStudioInteractions(editor.visualContainer, drop => {
              if (studioReadOnlyActive && studioRequestId) {
                postToHost(createEnvelope('studio.dropNode', studioRequestId, { ...drop }));
              }
            });
            studioReadOnly = installStudioReadOnly(editor.visualContainer);
            studioReadOnlyActive = true;
            // A scene is a native snapshot, not a user edit. loadMarkdown
            // deliberately resets the JS revision to zero for each snapshot.
            window.markdownEditor?.loadMarkdown(result.markdown);
            if (editor.visualContainer) applyStudioReadOnly(editor.visualContainer);
            markStudioSelection();
            editor.visualContainer?.querySelectorAll<HTMLElement>('[data-authored-node-id]').forEach(node => {
              const handle = document.createElement('button');
              handle.type = 'button';
              handle.draggable = true;
              handle.dataset.studioDragHandle = 'true';
              handle.textContent = '⠿';
              handle.setAttribute('aria-label', `Move ${node.dataset.authoredWidget ?? 'element'}`);
              node.prepend(handle);
            });
            requestAnimationFrame(() => requestAnimationFrame(() => {
              if (stage?.isConnected && generation === studioRenderGeneration) {
                stage.scrollTop = top;
                stage.scrollLeft = left;
              }
            }));
          }
          postToHost(createEnvelope('studio.previewRendered', envelope.requestId, {
            diagnostics: result.diagnostics,
          }));
          break;
        }
        case 'document.requestMetadata':
          window.markdownEditor?.requestMetadata(envelope.requestId ?? '');
          break;
        case 'document.updateMetadata':
          if (typeof envelope.payload.patch === 'object' && envelope.payload.patch !== null) {
            window.markdownEditor?.updateMetadata(
              envelope.payload.patch as Record<string, unknown>,
              envelope.requestId ?? undefined,
            );
          }
          break;
        case 'editor.setMode': {
          const mode = envelope.payload.mode;
          if (mode === 'visual' || mode === 'source') window.markdownEditor?.setMode(mode);
          break;
        }
        case 'editor.search': {
          const action = envelope.payload.action;
          if (action === 'open' || action === 'next' || action === 'previous'
            || action === 'replace' || action === 'replaceAll' || action === 'close') {
            window.markdownEditor?.search(action);
          }
          break;
        }
        case 'editor.deleteSelectedPage':
          window.markdownEditor?.deleteSelectedPage();
          break;
        case 'editor.applyThemeToComponent': {
          const componentSlot = envelope.payload.componentSlot;
          const themeAlias = envelope.payload.themeAlias;
          if (typeof componentSlot !== 'string' || typeof themeAlias !== 'string') {
            postToHost(createEnvelope(
              'document.themeComponent.updated',
              envelope.requestId,
              {
                updated: false,
                diagnostics: [{
                  code: 'bridge.invalid-theme-command',
                  message: 'Theme component and alias must be strings.',
                  severity: 'error',
                }],
              },
            ));
            break;
          }
          editor.commitPendingChanges?.();
          const result = updateDocumentComponentTheme(
            editor.getMarkdown(),
            componentSlot,
            themeAlias,
          );
          if (result.updated) {
            if (editor.replaceMarkdownPreservingMode) {
              editor.replaceMarkdownPreservingMode(result.source);
            } else {
              editor.setContent(result.source, true);
            }
            recordDocumentChange();
          }
          postToHost(createEnvelope(
            'document.themeComponent.updated',
            envelope.requestId,
            {
              updated: result.updated,
              diagnostics: result.diagnostics,
            },
          ));
          break;
        }
        case 'editor.updateSelectedLmxBlock': {
          const path = envelope.payload.path;
          const attributes = envelope.payload.attributes;
          const identifier = envelope.payload.identifier;
          if (
            isLmxPath(path)
            && isLmxAttributes(attributes)
            && (typeof identifier === 'string' || identifier === null)
          ) {
            editor.updateLmxBlockMetadata?.(path, { identifier, attributes });
          }
          break;
        }
        case 'editor.selectPage': {
          const pageIndex = envelope.payload.pageIndex;
          if (typeof pageIndex === 'number') window.markdownEditor?.selectPage(pageIndex);
          break;
        }
        case 'editor.addPage': {
          const afterPageIndex = envelope.payload.afterPageIndex;
          if (typeof afterPageIndex === 'number') window.markdownEditor?.addPage(afterPageIndex);
          break;
        }
        case 'editor.deletePage': {
          const pageIndex = envelope.payload.pageIndex;
          if (typeof pageIndex === 'number') window.markdownEditor?.deletePage(pageIndex);
          break;
        }
        case 'editor.movePage': {
          const pageIndex = envelope.payload.pageIndex;
          const direction = envelope.payload.direction;
          if (typeof pageIndex === 'number' && (direction === 'up' || direction === 'down')) {
            window.markdownEditor?.movePage(pageIndex, direction);
          }
          break;
        }
        case 'editor.setZoom': {
          const magnification = envelope.payload.magnification;
          const pageIndex = envelope.payload.pageIndex;
          const interactive = envelope.payload.interactive;
          if (typeof magnification === 'number') {
            window.markdownEditor?.setZoom(
              magnification,
              typeof pageIndex === 'number' ? pageIndex : null,
              interactive === true,
            );
          }
          break;
        }
        case 'editor.setMathTypeEnabled': {
          const enabled = envelope.payload.enabled;
          if (typeof enabled === 'boolean') window.markdownEditor?.setMathTypeEnabled(enabled);
          break;
        }
        case 'editor.revealLocation': {
          const location = parseSourceRange(envelope.payload);
          if (location) window.markdownEditor?.revealLocation(location);
          break;
        }
        case 'editor.setPageNavigatorDemand': {
          const demand = parsePageNavigatorDemand(envelope.payload);
          if (demand) window.markdownEditor?.setPageNavigatorDemand(demand);
          break;
        }
        case 'editor.imageDrop.result': {
          const resolve = pendingImageDrops.get(envelope.requestId ?? '');
          if (!resolve) break;
          pendingImageDrops.delete(envelope.requestId ?? '');
          const relativePath = envelope.payload.relativePath;
          resolve(typeof relativePath === 'string' ? relativePath : null);
          break;
        }
        default:
          break;
      }
    },
  };

  editor.on('content-change', () => {
    recordDocumentChange();
  });

  editor.onModeChange?.((transition) => {
    postToHost(createEnvelope('editor.modeChanged', null, {
      mode: transition.mode,
      requestedMode: transition.requestedMode,
      accepted: transition.accepted,
    }));
  });

  editor.onLmxBlockSelected?.((selection) => {
    postToHost(createEnvelope('editor.lmxBlockSelected', null, {
      name: selection.name,
      identifier: selection.identifier,
      attributes: selection.attributes,
      path: selection.path,
      hasCustomOverride: hasQuickStyleOverride(selection.attributes),
    }));
  });

  editor.onPageSelectionChange?.((selection) => {
    postToHost(createEnvelope('editor.pageSelectionChanged', null, selection ?? { selected: false }));
  });

  editor.onPageInventoryChange?.((pages) => {
    // Keep internal top-level block indices inside the web editor; native UI
    // only needs the transient page metadata and can address pages by index.
    const publicPages = pages.map(({ pageIndex, kind, semanticName, blockCount,
      deletable, title }) => ({
      pageIndex,
      kind,
      semanticName,
      blockCount,
      deletable,
      title,
    }));
    const layoutRevision = Number.parseInt(editor.visualContainer?.dataset.pageLayoutRevision ?? '0', 10);
    postToHost(createEnvelope('editor.pageInventoryChanged', null, { layoutRevision, pages: publicPages }));
  });

  editor.onPageThumbnailChange?.((thumbnail) => {
    postToHost(createEnvelope('editor.pageThumbnailChanged', null, thumbnail));
  });
  editor.onPageThumbnailFailure?.((failure) => {
    postToHost(createEnvelope('editor.pageThumbnailFailed', null, failure));
  });

  editor.visualContainer?.addEventListener(VISUAL_PAGE_ADD_REQUESTED, (event) => {
    const { afterPageIndex } = (event as CustomEvent<VisualPageAddRequest>).detail ?? {};
    if (!Number.isInteger(afterPageIndex) || afterPageIndex < 0) return;
    postToHost(createEnvelope('editor.pageActionRequested', null, {
      action: 'addAfter',
      pageIndex: afterPageIndex,
    }));
  });

  editor.visualContainer?.addEventListener(VISUAL_PAGE_DELETE_REQUESTED, (event) => {
    const { pageIndex } = (event as CustomEvent<VisualPageDeleteRequest>).detail ?? {};
    if (!Number.isInteger(pageIndex) || pageIndex < 0) return;
    postToHost(createEnvelope('editor.pageActionRequested', null, {
      action: 'delete',
      pageIndex,
    }));
  });

  editor.visualContainer?.addEventListener(VISUAL_PAGE_MOVE_REQUESTED, (event) => {
    const { pageIndex, direction } = (event as CustomEvent<VisualPageMoveRequest>).detail ?? {};
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || (direction !== 'up' && direction !== 'down')) {
      return;
    }
    postToHost(createEnvelope('editor.pageActionRequested', null, {
      action: direction === 'up' ? 'moveUp' : 'moveDown',
      pageIndex,
    }));
  });

  const handleDragOver = (event: DragEvent): void => {
    const file = event.dataTransfer?.files[0];
    if (!file || !IMAGE_MIME.test(file.type)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (event: DragEvent): Promise<void> => {
    const file = event.dataTransfer?.files[0];
    if (!file || !IMAGE_MIME.test(file.type)) return;
    event.preventDefault();
    if (!editor.insertTextAtSelection || file.size > MAX_DROPPED_IMAGE_BYTES) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    const requestId = `image-drop-${crypto.randomUUID()}`;
    const relativePath = await new Promise<string | null>((resolve) => {
      pendingImageDrops.set(requestId, (path) => resolve(path));
      postToHost(createEnvelope('editor.imageDrop', requestId, {
        filename: file.name,
        mimeType: file.type,
        dataBase64: btoa(binary),
      }));
      window.setTimeout(() => {
        if (pendingImageDrops.delete(requestId)) resolve(null);
      }, 30_000);
    });
    if (!relativePath) return;
    const alt = file.name.replace(/\.[^.]+$/, '').trim() || 'image';
    editor.insertTextAtSelection(`![${alt}](${relativePath})`);
  };

  editor.visualContainer?.addEventListener('dragover', handleDragOver);
  editor.visualContainer?.addEventListener('drop', handleDrop);

  installHostTransport();
  postToHost(createEnvelope('editor.ready', null));
}

function parsePageNavigatorDemand(payload: Record<string, unknown>): PageNavigatorDemand | null {
  if (!Array.isArray(payload.pageIndices) || typeof payload.targetWidth !== 'number') return null;
  if (
    !Number.isFinite(payload.targetWidth)
    || payload.targetWidth < MIN_THUMBNAIL_WIDTH
    || payload.targetWidth > MAX_THUMBNAIL_WIDTH
  ) return null;
  const pageIndices = [...new Set(payload.pageIndices.filter((value): value is number => (
    Number.isInteger(value) && value >= 0
  )))].sort((a, b) => a - b);
  return { pageIndices, targetWidth: Math.round(payload.targetWidth) };
}

function parseSourceRange(payload: Record<string, unknown>): DocumentSourceRange | null {
  const values = [
    payload.from,
    payload.to,
    payload.startLine,
    payload.startColumn,
    payload.endLine,
    payload.endColumn,
  ];
  if (!values.every((value) => Number.isInteger(value))) return null;
  const [from, to, startLine, startColumn, endLine, endColumn] = values as number[];
  if (
    from < 0
    || to < from
    || startLine < 1
    || startColumn < 1
    || endLine < startLine
    || endColumn < 1
    || (endLine === startLine && endColumn < startColumn)
  ) return null;
  return { from, to, startLine, startColumn, endLine, endColumn };
}

function isLmxPath(value: unknown): value is Array<string | number> {
  return Array.isArray(value)
    && value.length > 0
    && value.every((part) => typeof part === 'string' || Number.isInteger(part));
}

function isLmxAttributes(value: unknown): value is LmxBlockMetadataPatch['attributes'] {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((attribute) => (
      typeof attribute === 'string'
      || typeof attribute === 'number'
      || typeof attribute === 'boolean'
    ));
}

function readMetadataState(markdown: string): { signature: string; valid: boolean } {
  const parsed = parseFrontMatter(markdown);
  return {
    valid: parsed.valid,
    signature: JSON.stringify({
      data: parsed.data,
      valid: parsed.valid,
      diagnostics: parsed.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        severity: diagnostic.severity,
      })),
    }),
  };
}
