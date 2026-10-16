import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  EditorState,
  RangeSet,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import type { SourceMarkdownEditor } from './editor-mode';

const A4_HEIGHT_TO_WIDTH = 297 / 210;

class SourcePageGapWidget extends WidgetType {
  constructor(
    private readonly height: number,
    private readonly scale: number,
  ) {
    super();
  }

  eq(other: SourcePageGapWidget): boolean {
    return this.height === other.height && this.scale === other.scale;
  }

  get estimatedHeight(): number {
    // CodeMirror's height map uses screen pixels, including for offscreen widgets.
    return this.height * this.scale;
  }

  toDOM(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'source-page-gap';
    element.style.height = `${this.height}px`;
    element.setAttribute('aria-hidden', 'true');
    return element;
  }
}

const setSourcePageBreaks = StateEffect.define<DecorationSet>();

const sourcePageBreakField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setSourcePageBreaks)) next = effect.value;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

class SourcePageBreakMeasurer {
  private readonly resizeObserver: ResizeObserver | null;
  private lastMeasurementKey = '';
  private lastDocument: EditorState['doc'] | null = null;
  private destroyed = false;

  constructor(private readonly view: EditorView) {
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(this.schedule);
    if (view.dom.parentElement) this.resizeObserver?.observe(view.dom.parentElement);
    window.addEventListener('resize', this.schedule);
    this.schedule();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.geometryChanged || update.viewportChanged) {
      this.schedule();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.schedule);
  }

  readonly schedule = (): void => {
    this.view.requestMeasure({
      key: this,
      read: (view) => {
        const parent = view.dom.parentElement;
        const row = view.contentDOM.querySelector<HTMLElement>('.cm-line');
        if (!parent || !row || !parent.getClientRects().length) return null;
        const style = getComputedStyle(parent);
        const width = cssPixelValue(style.width, parent.clientWidth);
        const lineHeight = cssPixelValue(getComputedStyle(row).height, 0);
        if (width <= 0 || lineHeight <= 0) return null;
        const scale = parent.getBoundingClientRect().width / width;
        if (scale <= 0) return null;
        const contentStyle = getComputedStyle(view.contentDOM);
        const geometry = {
          pageHeight: width * A4_HEIGHT_TO_WIDTH,
          pageGap: cssPixelValue(style.getPropertyValue('--visual-page-gap'), 24),
          lineHeight,
          paddingTop: cssPixelValue(contentStyle.paddingTop, 0),
          paddingBottom: cssPixelValue(contentStyle.paddingBottom, 0),
        };
        const key = JSON.stringify([geometry, scale]);
        const doc = view.state.doc;
        if (key === this.lastMeasurementKey && doc === this.lastDocument) return null;
        const layout = calculateSourcePageLayout(doc.lines, geometry);
        const decorations = Decoration.set(layout.breaks.map(({ lineNumber, height }) => (
          Decoration.widget({
            widget: new SourcePageGapWidget(height, scale),
            block: true,
            side: -1,
          }).range(doc.line(lineNumber).from)
        )), true);
        return { parent, doc, key, geometry, layout, decorations };
      },
      write: (measurement, view) => {
        if (!measurement) return;
        // State dispatch must occur outside CodeMirror's measure/update phase.
        queueMicrotask(() => {
          if (this.destroyed || !view.dom.isConnected) return;
          if (view.state.doc !== measurement.doc) {
            this.schedule();
            return;
          }
          const { parent, doc, key, geometry, layout, decorations } = measurement;
          this.lastDocument = doc;
          this.lastMeasurementKey = key;
          setCssPixels(parent, '--visual-page-height', geometry.pageHeight);
          // CodeMirror derives scaleY using offsetHeight (integer CSS pixels).
          // A fractional fixed canvas height makes each gutter row round down,
          // accumulating drift against the actual source lines far down a file.
          setCssPixels(parent, '--source-page-stack-height', Math.ceil(layout.stackHeight));
          const current = view.state.field(sourcePageBreakField);
          if (!RangeSet.eq([current], [decorations])) {
            view.dispatch({ effects: setSourcePageBreaks.of(decorations) });
          }
        });
      },
    });
  };
}

const sourcePageBreakPlugin = ViewPlugin.fromClass(SourcePageBreakMeasurer);
const sourcePageBreaks = [
  sourcePageBreakField,
  sourcePageBreakPlugin,
];

export class CodeMirrorSourceEditor implements SourceMarkdownEditor {
  private readonly view: EditorView;
  private readonly changeListeners = new Set<() => void>();
  private applyingValue = false;

  constructor(parent: HTMLElement) {
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          sourcePageBreaks,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.applyingValue) {
              this.changeListeners.forEach((listener) => listener());
            }
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: '#fffefc',
              backgroundImage: 'repeating-linear-gradient(to bottom, var(--paper) 0, var(--paper) var(--visual-page-height), #efede8 var(--visual-page-height), #efede8 calc(var(--visual-page-height) + var(--visual-page-gap)))',
              color: '#282724',
            },
            '.cm-content': {
              caretColor: '#0f5c55',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '14px',
              lineHeight: '1.65',
              padding: '28px 0 80px',
            },
            '.cm-gutters': {
              backgroundColor: '#fffefc',
              backgroundImage: 'repeating-linear-gradient(to bottom, var(--paper) 0, var(--paper) var(--visual-page-height), #efede8 var(--visual-page-height), #efede8 calc(var(--visual-page-height) + var(--visual-page-gap)))',
              borderRight: '1px solid #ded7ca',
              color: '#887f71',
            },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
              backgroundColor: '#cfe4dc',
            },
            '&.cm-focused': { outline: 'none' },
          }),
        ],
      }),
    });
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  getSelection(): { from: number; to: number; text: string } {
    const { from, to } = this.view.state.selection.main;
    return { from, to, text: this.view.state.sliceDoc(from, to) };
  }

  setValue(markdown: string): void {
    if (markdown === this.getValue()) return;
    this.applyingValue = true;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: markdown },
    });
    this.applyingValue = false;
  }

  replaceRanges(ranges: Array<{ from: number; to: number }>, replacement: string): boolean {
    if (!ranges.length) return false;
    const length = this.view.state.doc.length;
    const changes = [...ranges]
      .sort((a, b) => a.from - b.from)
      .map(({ from, to }) => ({
        from: Math.max(0, Math.min(from, length)),
        to: Math.max(0, Math.min(to, length)),
        insert: replacement,
      }));
    if (changes.some((change, index) => change.from > change.to
      || (index > 0 && change.from < changes[index - 1].to))) return false;
    this.view.dispatch({
      changes,
      userEvent: 'input.replace',
      annotations: isolateHistory.of('full'),
    });
    return true;
  }

  onChange(listener: () => void): void {
    this.changeListeners.add(listener);
  }

  focus(): void {
    this.view.focus();
    this.view.plugin(sourcePageBreakPlugin)?.schedule();
  }

  revealRange(from: number, to: number, focus = true): boolean {
    const length = this.view.state.doc.length;
    const safeFrom = Math.max(0, Math.min(from, length));
    const safeTo = Math.max(safeFrom, Math.min(to, length));
    this.view.dispatch({
      selection: { anchor: safeFrom, head: safeTo },
      effects: EditorView.scrollIntoView(safeFrom, { y: 'center' }),
    });
    if (focus) this.view.focus();
    return true;
  }

}

interface SourcePageGeometry {
  pageHeight: number;
  pageGap: number;
  lineHeight: number;
  paddingTop: number;
  paddingBottom: number;
}

/**
 * Source uses uniform, non-wrapping rows. Paginate those rows in layout pixels,
 * never the decorated/virtualized height map (which changes with scroll/zoom).
 * Work is proportional to page count rather than document length.
 */
export function calculateSourcePageLayout(
  lineCount: number,
  { pageHeight, pageGap, lineHeight, paddingTop, paddingBottom }: SourcePageGeometry,
): { breaks: Array<{ lineNumber: number; height: number }>; stackHeight: number } {
  const slotHeight = pageHeight + pageGap;
  const breaks: Array<{ lineNumber: number; height: number }> = [];
  let top = paddingTop;
  let lineNumber = 1;
  while (lineNumber <= lineCount) {
    const pageOffset = ((top % slotHeight) + slotHeight) % slotHeight;
    const fittingRows = Math.floor((pageHeight - pageOffset + 0.000001) / lineHeight);
    if (fittingRows <= 0 && lineNumber > 1 && lineHeight < pageHeight) {
      // Virtualized rows and zoomed screen coordinates round independently.
      // Leave one layout pixel inside the next sheet so subpixel error cannot
      // put the first source line (or its gutter) back into the preceding gap.
      const height = Math.ceil(slotHeight - pageOffset) + 1;
      breaks.push({ lineNumber, height });
      top += height;
    } else {
      const rows = Math.min(lineCount - lineNumber + 1, Math.max(1, fittingRows));
      top += rows * lineHeight;
      lineNumber += rows;
    }
  }
  const pageCount = Math.max(1, Math.ceil((top + paddingBottom + pageGap) / slotHeight));
  return { breaks, stackHeight: pageCount * slotHeight - pageGap };
}

function setCssPixels(element: HTMLElement, property: string, value: number): void {
  const pixels = `${value}px`;
  if (element.style.getPropertyValue(property) !== pixels) {
    element.style.setProperty(property, pixels);
  }
}

function cssPixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
