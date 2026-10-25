import { Muya } from '@markdown/muya-core';
import { MarkdownToState } from '@markdown/muya-core/state/markdownToState.js';
import './styles.css';
import { getLmxInsertCommand } from '@markdown/document-core';
import { installBridge } from './bridge';
import { resolveDocumentImageSrc } from './host-transport';
import { EditorSurface } from './editor-surface';
import {
  createHcmutStructurePreviewRenderer,
  readVisualPageDecorationSettings,
  refreshHcmutStructurePreviews,
} from './hcmut-structure-preview';
import { CodeMirrorSourceEditor } from './source-editor';
import { insertLmxTemplateAtTrigger } from './semantic-blocks';
import { registerMarkTextPlugins } from './muya-plugins';
import { installVisualPageFlow } from './visual-page-flow';
import { installVisualPageThumbnailRenderer } from './page-thumbnail-renderer';
import { installVisualPageActionStrip } from './page-action-strip';
import { installEditorCanvasZoom } from './editor-canvas-zoom';
import { VisualSearchAdapter } from './visual-search';
import { SearchReplacePanel } from './search-replace-panel';

const container = document.querySelector<HTMLElement>('#editor');
const sourceContainer = document.querySelector<HTMLElement>('#source-editor');
const visualButton = document.querySelector<HTMLButtonElement>('#mode-visual');
const sourceButton = document.querySelector<HTMLButtonElement>('#mode-source');
const diagnostics = document.querySelector<HTMLElement>('#diagnostics');
const zoomCanvas = document.querySelector<HTMLElement>('.editor-zoom-canvas');
if (!container || !sourceContainer || !visualButton || !sourceButton || !diagnostics || !zoomCanvas) {
  throw new Error('Editor shell is missing a required element');
}
const visualModeButton = visualButton;
const sourceModeButton = sourceButton;
const diagnosticsPanel = diagnostics;

let surface: EditorSurface;
const insertAcademicCommand = (
  commandId: string,
  triggerText = '',
  topLevelIndex: number | null = null,
): void => {
  const template = getLmxInsertCommand(commandId)?.template;
  if (!template) return;
  if (surface.mode === 'source') {
    surface.insertTextAtSelection(`\n${template}`);
    return;
  }
  const localState = new MarkdownToState().generate(template).find((state) => state.name === 'lmx-directive');
  const insertedLocally = topLevelIndex !== null
    && localState !== undefined
    && surface.replaceTopLevelBlock(topLevelIndex, localState);
  if (!insertedLocally) {
    surface.commitPendingChanges();
    const updatedMarkdown = insertLmxTemplateAtTrigger(
      surface.getMarkdown(),
      commandId,
      triggerText,
    );
    const updatedState = new MarkdownToState().generate(updatedMarkdown);
    if (!surface.replaceAllTopLevelBlocks(updatedState)) {
      surface.replaceContent(updatedMarkdown, { animate: true });
    }
  }
  setTimeout(() => {
    if (insertedLocally && topLevelIndex !== null) surface.focusTopLevelBlock(topLevelIndex);
    else surface.focusLastLmxBlock(commandId);
  });
};
registerMarkTextPlugins({
  insertCommand: insertAcademicCommand,
});

let muya: Muya | undefined;
let cachedVisualMarkdown = '# Báo cáo Markdown\n\nBắt đầu nhập nội dung của bạn ở đây.';
const readCurrentVisualMarkdown = (): string => {
  if (!cachedVisualMarkdown && muya) {
    cachedVisualMarkdown = muya.getMarkdown();
  }
  return cachedVisualMarkdown;
};
muya = new Muya(container, {
  frontMatter: true,
  math: true,
  spellcheckEnabled: true,
  resolveImageSrc: resolveDocumentImageSrc,
  structurePreviewRenderer: createHcmutStructurePreviewRenderer(() => muya?.getMarkdown() ?? ''),
});
muya.init();
muya.setContent(cachedVisualMarkdown, true);
let structureRefreshFrame: number | null = null;
muya.on('content-change', () => {
  cachedVisualMarkdown = '';
  if (structureRefreshFrame !== null) cancelAnimationFrame(structureRefreshFrame);
  structureRefreshFrame = requestAnimationFrame(() => {
    structureRefreshFrame = null;
    refreshHcmutStructurePreviews(muya!.domNode, readCurrentVisualMarkdown);
  });
});
muya.domNode.addEventListener('editor-content-loaded', () => {
  cachedVisualMarkdown = '';
});
installVisualPageFlow(muya.domNode, {
  getPageDecorationSettings: () => readVisualPageDecorationSettings(readCurrentVisualMarkdown()),
});
const sourceEditor = new CodeMirrorSourceEditor(sourceContainer);
const editorSurface = new EditorSurface(muya, sourceEditor, muya.domNode, sourceContainer);
const visualSearch = new VisualSearchAdapter(muya);
const searchReplace = new SearchReplacePanel(sourceEditor, {
  isSource: () => editorSurface.mode === 'source',
  showSource: () => window.markdownEditor?.setMode('source'),
  focusEditor: () => {
    if (editorSurface.mode === 'source') sourceEditor.focus();
    else muya.focus();
  },
}, visualSearch);
muya.on('content-change', () => searchReplace.onVisualChange());
installVisualPageThumbnailRenderer(muya.domNode);
installVisualPageActionStrip(muya.domNode);
const canvasZoom = installEditorCanvasZoom(zoomCanvas);
surface = editorSurface;
editorSurface.onModeChange((transition) => {
  searchReplace.onModeChange();
  renderDiagnostics(transition.diagnostics);
  updateModeButtons();
});
installBridge({
  setContent: editorSurface.setContent.bind(editorSurface),
  replaceMarkdownPreservingMode: editorSurface.replaceMarkdownPreservingMode.bind(editorSurface),
  commitPendingChanges: editorSurface.commitPendingChanges.bind(editorSurface),
  getMarkdown: editorSurface.getMarkdown.bind(editorSurface),
  on: editorSurface.on.bind(editorSurface),
  onLmxBlockSelected: editorSurface.onLmxBlockSelected.bind(editorSurface),
  updateLmxBlockMetadata: editorSurface.updateLmxBlockMetadata.bind(editorSurface),
  onPageSelectionChange: editorSurface.onPageSelectionChange.bind(editorSurface),
  onModeChange: editorSurface.onModeChange.bind(editorSurface),
  setMode: editorSurface.setMode.bind(editorSurface),
  insertTextAtSelection: editorSurface.insertTextAtSelection.bind(editorSurface),
  insertLmxCommand: (commandId: string) => insertAcademicCommand(commandId, '', null),
  deleteSelectedPage: editorSurface.deleteSelectedPage.bind(editorSurface),
  selectPage: editorSurface.selectPage.bind(editorSurface),
  addPage: editorSurface.addPage.bind(editorSurface),
  deletePage: editorSurface.deletePage.bind(editorSurface),
  movePage: editorSurface.movePage.bind(editorSurface),
  getState: muya.getState.bind(muya),
  replaceTopLevelBlocks: muya.replaceTopLevelBlocks.bind(muya),
  setZoom: canvasZoom.setZoom,
  onPageInventoryChange: editorSurface.onPageInventoryChange.bind(editorSurface),
  onPageThumbnailChange: editorSurface.onPageThumbnailChange.bind(editorSurface),
  onPageThumbnailFailure: editorSurface.onPageThumbnailFailure.bind(editorSurface),
  setPageNavigatorDemand: editorSurface.setPageNavigatorDemand.bind(editorSurface),
  revealLocation: editorSurface.revealLocation.bind(editorSurface),
  visualContainer: muya.domNode,
  search: searchReplace.handle.bind(searchReplace),
  resetSearch: searchReplace.reset.bind(searchReplace),
});

visualModeButton.addEventListener('click', () => {
  surface.showVisual();
});

sourceModeButton.addEventListener('click', () => {
  surface.showSource();
});

function updateModeButtons(): void {
  const isVisual = surface.mode === 'visual';
  visualModeButton.classList.toggle('active', isVisual);
  sourceModeButton.classList.toggle('active', !isVisual);
  visualModeButton.setAttribute('aria-pressed', String(isVisual));
  sourceModeButton.setAttribute('aria-pressed', String(!isVisual));
}

function renderDiagnostics(items: Array<{ message: string }>): void {
  diagnosticsPanel.replaceChildren();
  diagnosticsPanel.hidden = items.length === 0;
  for (const item of items) {
    const message = document.createElement('p');
    message.textContent = item.message;
    diagnosticsPanel.append(message);
  }
}

updateModeButtons();
