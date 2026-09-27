import { parseFrontMatter, parseLmx, type DocumentDiagnostic } from '@markdown/document-core';

export type EditorMode = 'visual' | 'source';

export interface VisualMarkdownEditor {
  getMarkdown(): string;
  setContent(markdown: string, autoFocus?: boolean): void;
}

export interface SourceMarkdownEditor {
  getValue(): string;
  setValue(markdown: string): void;
  replaceRanges?(ranges: Array<{ from: number; to: number }>, replacement: string): boolean;
  revealRange?(from: number, to: number, focus?: boolean): boolean;
}

export type ModeTransitionResult =
  | { ok: true; diagnostics: DocumentDiagnostic[] }
  | { ok: false; diagnostics: DocumentDiagnostic[] };

export class EditorModeController {
  mode: EditorMode = 'visual';

  constructor(
    private readonly visual: VisualMarkdownEditor,
    private readonly source: SourceMarkdownEditor,
  ) {}

  showSource(): ModeTransitionResult {
    if (this.mode === 'visual') {
      this.source.setValue(this.visual.getMarkdown());
      this.mode = 'source';
    }
    return { ok: true, diagnostics: [] };
  }

  showVisual(): ModeTransitionResult {
    if (this.mode === 'visual') return { ok: true, diagnostics: [] };

    const markdown = this.source.getValue();
    const parsed = parseFrontMatter(markdown);
    if (!parsed.valid) {
      return { ok: false, diagnostics: parsed.diagnostics };
    }
    const lmx = parseLmx(parsed.body);
    if (lmx.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return { ok: false, diagnostics: lmx.diagnostics };
    }

    this.visual.setContent(markdown, true);
    this.mode = 'visual';
    return { ok: true, diagnostics: parsed.diagnostics };
  }

  getMarkdown(): string {
    return this.mode === 'source' ? this.source.getValue() : this.visual.getMarkdown();
  }

  loadMarkdown(markdown: string): ModeTransitionResult {
    this.source.setValue(markdown);
    // Opening a file must use the same validation as switching Source → Visual.
    // Until that succeeds, the exact incoming bytes remain authoritative.
    this.mode = 'source';
    return this.showVisual();
  }

  replaceMarkdownPreservingMode(markdown: string): void {
    if (this.mode === 'source') {
      this.source.setValue(markdown);
    } else {
      this.visual.setContent(markdown, true);
    }
  }
}
