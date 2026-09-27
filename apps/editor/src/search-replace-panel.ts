import {
  findSearchMatches,
  replaceSearchMatches,
  SEARCH_QUERY_LIMIT,
  type SearchMatch,
} from './search-replace';
import type { CodeMirrorSourceEditor } from './source-editor';
import type { VisualSearchAdapter, VisualMatch } from './visual-search';

type SearchAction = 'open' | 'next' | 'previous' | 'replace' | 'replaceAll' | 'close';

interface SearchScope {
  isSource(): boolean;
  showSource(): void;
  focusEditor(): void;
}

export class SearchReplacePanel {
  private readonly root: HTMLElement;
  private readonly queryInput: HTMLInputElement;
  private readonly replacementInput: HTMLInputElement;
  private readonly replacementRow: HTMLElement;
  private readonly status: HTMLElement;
  private readonly scopeButton: HTMLButtonElement;
  private matches: SearchMatch[] = [];
  private index = -1;
  private caseSensitive = false;
  private wholeWord = false;
  private visible = false;
  private refreshQueued = false;
  private visualMatches: VisualMatch[] = [];
  private lastSource = true;

  constructor(
    private readonly source: CodeMirrorSourceEditor,
    private readonly scope: SearchScope,
    private readonly visual?: VisualSearchAdapter,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'search-replace-panel';
    this.root.setAttribute('aria-label', 'Find and Replace');
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="search-find-row">
        <button type="button" data-action="toggleReplace" aria-label="Toggle replace"
          aria-expanded="false" aria-controls="search-replace-row" title="Toggle replace">›</button>
        <input class="search-query" aria-label="Find in Markdown source" aria-describedby="search-scope"
          placeholder="Find in source" type="text" maxlength="1024" spellcheck="false" />
        <button type="button" data-action="case" aria-label="Match case" aria-pressed="false" title="Match case">Aa</button>
        <button type="button" data-action="word" aria-label="Whole word" aria-pressed="false" title="Whole word">ab</button>
        <button type="button" data-action="previous" aria-label="Previous match" title="Previous match (Shift+Enter)">↑</button>
        <button type="button" data-action="next" aria-label="Next match" title="Next match (Enter)">↓</button>
        <button type="button" data-action="close" aria-label="Close Find and Replace" title="Close (Escape)">×</button>
      </div>
      <div class="search-replace-row" id="search-replace-row" hidden>
        <input class="search-replacement" aria-label="Replace with" placeholder="Replace with"
          type="text" maxlength="16384" spellcheck="false" />
        <button type="button" data-action="replace">Replace</button>
        <button type="button" data-action="replaceAll">Replace All</button>
      </div>
      <div class="search-details">
        <span class="search-scope" id="search-scope">Source · Literal · Includes Markdown markup</span>
        <button type="button" data-action="source">Search Markdown source</button>
        <span class="search-status" role="status" aria-live="polite" aria-atomic="true"></span>
      </div>
    `;
    document.body.append(this.root);
    this.queryInput = this.root.querySelector<HTMLInputElement>('.search-query')!;
    this.replacementInput = this.root.querySelector<HTMLInputElement>('.search-replacement')!;
    this.replacementRow = this.root.querySelector<HTMLElement>('.search-replace-row')!;
    this.status = this.root.querySelector<HTMLElement>('.search-status')!;
    this.scopeButton = this.root.querySelector<HTMLButtonElement>('[data-action="source"]')!;
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || button.disabled) return;
      const action = button.dataset.action;
      if (action === 'toggleReplace') {
        this.setReplaceExpanded(this.replacementRow.hidden);
      } else if (action === 'case' || action === 'word') {
        if (action === 'case') this.caseSensitive = !this.caseSensitive;
        else this.wholeWord = !this.wholeWord;
        button.setAttribute('aria-pressed', String(action === 'case' ? this.caseSensitive : this.wholeWord));
        this.refresh(true, true);
      } else if (action === 'source') {
        // Explicit user action through the same guarded mode path as native UI.
        this.scope.showSource();
        this.refresh(true, true);
        this.queryInput.focus();
      } else if (action === 'next' || action === 'previous' || action === 'replace'
        || action === 'replaceAll' || action === 'close') {
        this.handle(action);
      }
    });
    this.queryInput.addEventListener('input', () => this.refresh(true, true));
    this.root.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.handle('close');
      } else if (event.key === 'Enter' && event.target === this.queryInput) {
        event.preventDefault();
        this.perform(event.shiftKey ? 'previous' : 'next');
      } else if (event.key === 'Enter' && event.target === this.replacementInput) {
        event.preventDefault();
        this.perform('replace');
      }
    });
    this.source.onChange(() => {
      if (!this.visible || this.refreshQueued) return;
      this.refreshQueued = true;
      // CodeMirror forbids nested dispatch from its update listener. Passive
      // recomputation must also leave a user's typing selection/focus untouched.
      queueMicrotask(() => {
        this.refreshQueued = false;
        this.refresh();
      });
    });
  }

  handle(action: SearchAction): void {
    if (action === 'open') {
      // Capture before moving focus; once open, the query belongs to the panel.
      const selection = this.scope.isSource() ? this.source.getSelection().text : this.visual?.selectionText() ?? '';
      if ((!this.visible || !this.root.contains(document.activeElement))
        && selection && selection.length <= SEARCH_QUERY_LIMIT && !/[\r\n]/.test(selection)) {
        this.queryInput.value = selection;
      }
      this.visible = true;
      this.root.hidden = false;
      this.refresh(true, true);
      this.queryInput.focus();
      this.queryInput.select();
      return;
    }
    if (action === 'close') {
      this.visible = false;
      this.root.hidden = true;
      if (!this.scope.isSource() && this.visual) this.visual.focus(this.visualMatches[this.index]);
      else this.scope.focusEditor();
      return;
    }
    if (!this.visible) this.handle('open');
    if (action === 'replace' || action === 'replaceAll') this.setReplaceExpanded(true);
    this.perform(action);
  }

  reset(): void {
    this.visual?.clear();
    this.visualMatches = [];
    this.visible = false;
    this.root.hidden = true;
    this.queryInput.value = '';
    this.replacementInput.value = '';
    this.matches = [];
    this.index = -1;
    this.status.textContent = '';
    this.setReplaceExpanded(false);
  }

  onModeChange(): void {
    this.visual?.clear();
    this.visualMatches = [];
    this.matches = [];
    this.refresh(true);
  }

  onVisualChange(): void {
    if (!this.visible || this.scope.isSource() || this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => { this.refreshQueued = false; this.refresh(); });
  }

  private setReplaceExpanded(expanded: boolean): void {
    this.replacementRow.hidden = !expanded;
    const button = this.root.querySelector<HTMLButtonElement>('[data-action="toggleReplace"]')!;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? '⌄' : '›';
  }

  private perform(action: Exclude<SearchAction, 'open' | 'close'>): void {
    // Revalidate immediately before every action, including bridge commands:
    // Source may now be hidden and its contents may belong to an older revision.
    this.refresh();
    if (!this.matches.length) return;
    if (action === 'next' || action === 'previous') {
      this.index = (this.index + (action === 'next' ? 1 : -1) + this.matches.length) % this.matches.length;
      this.revealCurrent();
      this.renderCounter();
      return;
    }
    if (!this.scope.isSource() && this.visual) {
      const chosen = action === 'replaceAll' ? this.visualMatches : [this.visualMatches[this.index]];
      const last = chosen[0];
      const result = this.visual.replace(chosen, this.replacementInput.value);
      if (result.error) { this.status.textContent = result.error; return; }
      this.refresh();
      if (action === 'replace' && last) {
        const end = last.from + this.replacementInput.value.length;
        const next = this.visualMatches.findIndex(m => m.block === last.block && m.from >= end);
        if (next >= 0) this.index = next;
      }
      this.revealCurrent();
      this.renderCounter();
      return;
    }
    const selected = action === 'replaceAll' ? this.matches : [this.matches[this.index]];
    const result = replaceSearchMatches(this.source.getValue(), selected, this.replacementInput.value);
    if (result.error) {
      this.status.textContent = result.error;
      return;
    }
    if (this.source.replaceRanges(selected, this.replacementInput.value)) {
      this.refresh();
      if (action === 'replace' && this.matches.length) {
        const end = selected[0].from + this.replacementInput.value.length;
        const next = this.matches.findIndex((match) => match.from >= end);
        this.index = next < 0 ? 0 : next;
      }
      this.revealCurrent();
      this.renderCounter();
    }
  }

  private refresh(resetIndex = false, reveal = false): void {
    if (!this.visible) return;
    const inSource = this.scope.isSource();
    this.scopeButton.hidden = inSource || !!this.visual;
    const scopeLabel = this.root.querySelector<HTMLElement>('.search-scope')!;
    scopeLabel.textContent = inSource
      ? 'Source · Literal · Includes Markdown markup'
      : 'Visual · Block text · Excludes document metadata';
    this.queryInput.setAttribute('aria-label', inSource ? 'Find in Markdown source' : 'Find in Visual blocks');
    this.queryInput.placeholder = inSource ? 'Find in source' : 'Find in document';
    const anchor = resetIndex ? this.source.getSelection().from : this.matches[this.index]?.from ?? 0;
    const previous = this.visualMatches[this.index];
    const previousIndex = this.index;
    const result = inSource
      ? findSearchMatches(this.source.getValue(), this.queryInput.value, this.caseSensitive, this.wholeWord)
      : this.visual?.find(this.queryInput.value, this.caseSensitive, this.wholeWord) ?? { matches: [], error: null };
    this.matches = result.matches;
    if (!inSource && this.visual) {
      this.visualMatches = result.matches as VisualMatch[];
      const same = !resetIndex && previous ? this.visualMatches.findIndex(m => m.block === previous.block && m.from === previous.from) : -1;
      this.index = this.matches.length ? (same >= 0 ? same : resetIndex || this.lastSource ? 0 : Math.max(0, Math.min(previousIndex, this.matches.length - 1))) : -1;
      this.visual.highlight(this.visualMatches, this.index, false);
    } else {
      this.visualMatches = [];
      const next = this.matches.findIndex((match) => match.from >= anchor);
      this.index = this.matches.length ? (next < 0 ? 0 : next) : -1;
    }
    this.lastSource = inSource;
    this.root.querySelectorAll<HTMLButtonElement>(
      '[data-action="previous"], [data-action="next"], [data-action="replace"], [data-action="replaceAll"]',
    ).forEach((button) => { button.disabled = !this.matches.length; });
    this.queryInput.setAttribute('aria-invalid', String(!!result.error));
    if (!inSource && !this.visual) this.status.textContent = 'Visual search is unavailable.';
    else if (result.error) this.status.textContent = result.error;
    else this.renderCounter();
    if (reveal) this.revealCurrent();
  }

  private renderCounter(): void {
    this.status.textContent = this.matches.length
      ? `${this.index + 1} of ${this.matches.length}`
      : this.queryInput.value ? 'No matches' : 'Enter text to find';
  }

  private revealCurrent(): void {
    const match = this.matches[this.index];
    if (match && this.scope.isSource()) this.source.revealRange(match.from, match.to, false);
    else this.visual?.highlight(this.visualMatches, this.index, true);
  }
}
