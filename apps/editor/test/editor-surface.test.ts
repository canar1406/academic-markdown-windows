// @vitest-environment happy-dom

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Muya } from '@markdown/muya-core';
import prism, { loadedLanguages } from '@markdown/muya-core/utils/prism/index.js';
import { EditorSurface } from '../src/editor-surface.js';
import {
  installVisualPageFlow,
  VISUAL_PAGE_LAYOUT_COMMITTED,
} from '../src/visual-page-flow.js';

const originalYamlGrammar = prism.languages.yaml;

beforeAll(() => {
  prism.languages.yaml = prism.languages.markup;
  loadedLanguages.add('yaml');
});

afterAll(() => {
  if (originalYamlGrammar) prism.languages.yaml = originalYamlGrammar;
  else delete prism.languages.yaml;
  loadedLanguages.delete('yaml');
});

describe('editor surface modes', () => {
  it('shows recovery source and reports a rejected Visual transition when opening malformed Markdown', () => {
    const visualContainer = document.createElement('section');
    const sourceContainer = document.createElement('section');
    const visual = new TestVisual('# Previous');
    const source = new TestSource();
    const surface = new EditorSurface(visual, source as never, visualContainer, sourceContainer);
    const transitions: unknown[] = [];
    surface.onModeChange(transition => transitions.push(transition));
    const markdown = '---\nlmx: [broken\n---\n\n# Giữ nguyên\n';

    surface.setContent(markdown);

    expect(surface.getMarkdown()).toBe(markdown);
    expect(visualContainer.hidden).toBe(true);
    expect(sourceContainer.hidden).toBe(false);
    expect(transitions).toContainEqual(expect.objectContaining({ mode: 'source', accepted: false }));
  });

  it('shows raw Markdown source instead of Visual block rendering in source mode', () => {
    const visualContainer = document.createElement('section');
    const sourceContainer = document.createElement('section');
    const markdown = ':::theorem {#thm-1 title="Bayes"}\nNội dung.\n:::\n';
    const visual = new TestVisual(markdown);
    const source = new TestSource();
    const surface = new EditorSurface(
      visual,
      source as never,
      visualContainer,
      sourceContainer,
    );

    surface.setMode('source');

    expect(surface.mode).toBe('source');
    expect(visualContainer.hidden).toBe(true);
    expect(sourceContainer.hidden).toBe(false);
    expect(source.value).toBe(markdown);
    expect(source.focused).toBe(true);
  });

  it('targets the live Muya node after Muya replaces its original mount element', () => {
    const originalMount = document.createElement('section');
    originalMount.id = 'editor';
    const sourceContainer = document.createElement('section');
    document.body.append(originalMount, sourceContainer);
    const muya = new Muya(originalMount, { frontMatter: true });
    muya.init();
    const source = new TestSource();
    const surface = new EditorSurface(muya, source as never, muya.domNode, sourceContainer);

    surface.setContent(':::theorem\nNội dung.\n:::\n');
    surface.setMode('source');

    expect(originalMount.isConnected).toBe(false);
    expect(muya.domNode.hidden).toBe(true);
    expect(sourceContainer.hidden).toBe(false);
    expect(source.value).toContain(':::theorem');
    muya.destroy();
  });

  it('keeps YAML metadata in source mode instead of rendering raw front matter in Visual', () => {
    const originalMount = document.createElement('section');
    const sourceContainer = document.createElement('section');
    document.body.append(originalMount, sourceContainer);
    const muya = new Muya(originalMount, { frontMatter: true });
    muya.init();
    const surface = new EditorSurface(
      muya,
      new TestSource() as never,
      muya.domNode,
      sourceContainer,
    );

    surface.setContent('---\nlmx:\n  schema: 1\n---\n\n# Nội dung\n');

    const frontMatter = muya.domNode.querySelector<HTMLElement>('.mu-frontmatter');
    const heading = muya.domNode.querySelector('h1');
    expect(frontMatter).not.toBeNull();
    expect(frontMatter?.hidden).toBe(true);
    expect(heading?.closest<HTMLElement>('.mu-container')?.hidden).toBe(false);
    muya.destroy();
  });

  it('commits canonical Muya state before completing a page layout transaction', async () => {
    const originalMount = document.createElement('section');
    const stage = document.createElement('div');
    stage.className = 'editor-stage';
    stage.append(originalMount);
    const sourceContainer = document.createElement('section');
    document.body.append(stage, sourceContainer);
    const muya = new Muya(originalMount, { frontMatter: true });
    muya.init();
    const surface = new EditorSurface(muya, new TestSource() as never, muya.domNode, sourceContainer);
    Object.defineProperty(muya.domNode, 'offsetWidth', { configurable: true, value: 210 });
    const disposeFlow = installVisualPageFlow(muya.domNode);
    try {
      surface.setContent('/cover\n');
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const committedState = new Promise<unknown[]>((resolve) => {
        muya.domNode.addEventListener(VISUAL_PAGE_LAYOUT_COMMITTED, () => {
          resolve(muya.getState());
        }, { once: true });
      });

      expect(surface.replaceTopLevelBlock(0, {
        name: 'lmx-directive',
        meta: { name: 'cover', attributes: {} },
        children: [{ name: 'paragraph', text: '' }],
      })).toBe(true);

      await expect(committedState).resolves.toMatchObject([
        { name: 'lmx-directive', meta: { name: 'cover' } },
      ]);
      expect(muya.domNode.dataset.pageTransaction).toBeUndefined();
    }
    finally {
      disposeFlow();
      muya.destroy();
      stage.remove();
      sourceContainer.remove();
    }
  });

  it('focuses a transient blank-page caret and materializes an undoable paragraph only on typing', async () => {
    const originalMount = document.createElement('section');
    const stage = document.createElement('div');
    stage.className = 'editor-stage';
    stage.append(originalMount);
    const sourceContainer = document.createElement('section');
    document.body.append(stage, sourceContainer);
    const muya = new Muya(originalMount, { frontMatter: true });
    muya.init();
    const surface = new EditorSurface(muya, new TestSource() as never, muya.domNode, sourceContainer);
    try {
      const markdown = ':::cover\n:::\n\n:::pagebreak\n:::\n';
      surface.setContent(markdown);
      const originalState = muya.getState();
      muya.domNode.style.setProperty('--visual-page-height', '100px');
      muya.domNode.style.setProperty('--visual-page-gap', '10px');
      muya.domNode.style.setProperty('--visual-page-stack-height', '320px');
      Object.defineProperty(muya.domNode, 'offsetWidth', { configurable: true, value: 210 });
      Object.defineProperty(muya.domNode, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, bottom: 320, left: 0, right: 210, width: 210, height: 320 }),
      });
      const blocks = [...muya.editor.scrollPage!.domNode!.children] as HTMLElement[];
      Object.defineProperty(blocks[0], 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, bottom: 100, left: 0, right: 210, width: 210, height: 100 }),
      });
      Object.defineProperty(blocks[1], 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 110, bottom: 110, left: 0, right: 210, width: 210, height: 0 }),
      });

      muya.domNode.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 100,
        clientY: 235,
      }));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const input = muya.domNode.querySelector<HTMLTextAreaElement>('[data-blank-page-input="2"]');
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
      expect(input?.closest('.mu-container')).toBeNull();
      expect(surface.getMarkdown()).toBe(markdown);
      expect(muya.getState()).toEqual(originalState);
      expect(muya.canUndo()).toBe(false);

      input!.value = 'Nội dung trang trống';
      input!.dispatchEvent(new InputEvent('input', {
        bubbles: true, inputType: 'insertText', data: 'Nội dung trang trống',
      }));
      muya.flushPendingChanges();
      // The test supplies layout geometry directly instead of installing the
      // browser paginator; signal the same transaction-commit boundary.
      muya.domNode.dispatchEvent(new Event(VISUAL_PAGE_LAYOUT_COMMITTED));

      expect(muya.domNode.querySelector('[data-blank-page-input]')).toBeNull();
      expect(muya.getState().at(-1)).toMatchObject({ name: 'paragraph', text: 'Nội dung trang trống' });
      expect(surface.getMarkdown()).toBe(`${markdown}\nNội dung trang trống\n`);
      expect(muya.editor.activeContentBlock?.domNode?.closest('[contenteditable="false"]')).toBeNull();
      expect(muya.canUndo()).toBe(true);

      surface.undo();
      muya.flushPendingChanges();
      muya.domNode.dispatchEvent(new Event(VISUAL_PAGE_LAYOUT_COMMITTED));
      expect(surface.getMarkdown()).toBe(markdown);
      expect(muya.getState()).toEqual(originalState);
      expect(muya.canUndo()).toBe(false);

      surface.redo();
      muya.flushPendingChanges();
      muya.domNode.dispatchEvent(new Event(VISUAL_PAGE_LAYOUT_COMMITTED));
      expect(surface.getMarkdown()).toBe(`${markdown}\nNội dung trang trống\n`);
    }
    finally {
      muya.destroy();
      stage.remove();
      sourceContainer.remove();
    }
  });

  it('updates a selected Quick Edit wrapper through one Muya metadata transaction', () => {
    const originalMount = document.createElement('section');
    const sourceContainer = document.createElement('section');
    document.body.append(originalMount, sourceContainer);
    const muya = new Muya(originalMount, { frontMatter: true });
    muya.init();
    const surface = new EditorSurface(muya, new TestSource() as never, muya.domNode, sourceContainer);
    try {
      surface.setContent(':::style {component="paragraph" color="#1E4B8F"}\nNội dung.\n:::\n');
      expect(surface.updateLmxBlockMetadata([0], {
        identifier: null,
        attributes: { component: 'paragraph', color: '#A12424', fontSizePt: 14 },
      })).toBe(true);
      muya.flushPendingChanges();

      expect(surface.getMarkdown()).toContain(
        ':::style {color="#A12424" component="paragraph" fontSizePt=14}',
      );
      expect(muya.domNode.querySelector<HTMLElement>('[data-lmx-name="style"]')?.style
        .getPropertyValue('--mu-lmx-color')).toBe('#A12424');
      expect(muya.canUndo()).toBe(true);
      muya.undo();
      expect(surface.getMarkdown()).toContain(
        ':::style {color="#1E4B8F" component="paragraph"}',
      );
    } finally {
      muya.destroy();
      sourceContainer.remove();
    }
  });

  it('reports Visual changes only after Muya commits canonical JSON state', () => {
    const visualContainer = document.createElement('section');
    const sourceContainer = document.createElement('section');
    const visual = new TestVisual('# Trước');
    const surface = new EditorSurface(
      visual,
      new TestSource() as never,
      visualContainer,
      sourceContainer,
    );
    let changes = 0;
    surface.on('content-change', () => { changes += 1; });

    visual.emit('content-change');
    expect(changes).toBe(0);
    visual.emit('json-change');
    expect(changes).toBe(1);
  });

  it('replaces Markdown while preserving Source mode visibility', () => {
    const visualContainer = document.createElement('section');
    const sourceContainer = document.createElement('section');
    const visual = new TestVisual('# Visual');
    const source = new TestSource();
    const surface = new EditorSurface(
      visual,
      source as never,
      visualContainer,
      sourceContainer,
    );

    surface.showSource();
    surface.replaceMarkdownPreservingMode('# Source cập nhật');

    expect(surface.mode).toBe('source');
    expect(source.value).toBe('# Source cập nhật');
    expect(visual.getMarkdown()).toBe('# Visual');
  });

  it('keeps Source visible and reports the authoritative mode when Visual validation fails', () => {
    const visualContainer = document.createElement('section');
    const sourceContainer = document.createElement('section');
    const visual = new TestVisual('# Bản an toàn');
    const source = new TestSource();
    const transitions: unknown[] = [];
    const surface = new EditorSurface(
      visual,
      source as never,
      visualContainer,
      sourceContainer,
    );
    surface.onModeChange((transition) => transitions.push(transition));
    surface.showSource();
    source.value = '---\ndocument: [broken\n---\n\n# Không được mất';

    surface.showVisual();

    expect(surface.mode).toBe('source');
    expect(visualContainer.hidden).toBe(true);
    expect(sourceContainer.hidden).toBe(false);
    expect(transitions.at(-1)).toMatchObject({
      mode: 'source',
      requestedMode: 'visual',
      accepted: false,
    });
  });
});

class TestVisual {
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  constructor(private markdown: string) {}
  getMarkdown(): string { return this.markdown; }
  setContent(markdown: string): void { this.markdown = markdown; }
  on(event: string, listener: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...this.listeners.get(event) ?? [], listener]);
  }
  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
  undo(): void {}
  redo(): void {}
  removeTopLevelBlocks(): boolean { return false; }
}

class TestSource {
  value = '';
  focused = false;
  getValue(): string { return this.value; }
  setValue(value: string): void { this.value = value; }
  onChange(): void {}
  focus(): void { this.focused = true; }
}
