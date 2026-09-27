// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentIndex } from '@markdown/document-core';
import { EditorSurface } from '../src/editor-surface';
import { installVisualPageFlow, VISUAL_PAGE_LAYOUT_COMMITTED } from '../src/visual-page-flow';
import { readVisualPageDecorationSettings } from '../src/hcmut-structure-preview';

afterEach(() => document.body.replaceChildren());

function createSurface(markdown: string) {
  const container = document.createElement('section');
  container.innerHTML = '<div class="mu-container"></div>';
  document.body.append(container);
  const visual = {
    getMarkdown: () => markdown,
    setContent: vi.fn(),
    on: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    removeTopLevelBlocks: vi.fn(() => true),
    insertTopLevelBlocks: vi.fn(() => true),
  };
  const source = { onChange: vi.fn() };
  const surface = new EditorSurface(visual, source as never, container, document.createElement('div'));
  return { surface, visual, container, root: container.firstElementChild as HTMLElement };
}

describe('source-addressed Visual navigation', () => {
  it.each([
    '---\ntitle: Báo cáo\nnotes: |\n  # Not a document heading\n---\n\n',
    '---\n/{lmx: {schema: 1}, title: "Báo cáo"}\n---\n\n',
  ])('uses the requested occurrence after front matter, not the first matching title (%s)', (prefix) => {
    const markdown = `${prefix}# Trùng tên\n\n:::pagebreak\n:::\n\n# Trùng tên\n`;
    const { surface, root } = createSurface(markdown);
    root.innerHTML = [
      '<h1 class="mu-atx-heading"><span contenteditable="true">Trùng tên</span></h1>',
      '<h1 class="mu-atx-heading"><span contenteditable="true">Trùng tên</span></h1>',
    ].join('');
    const headings = [...root.children] as HTMLElement[];
    const scrolls = headings.map(heading => {
      const scroll = vi.fn();
      heading.scrollIntoView = scroll;
      return scroll;
    });
    const range = createDocumentIndex(markdown).outline.at(-1)!.sourceRange;

    expect(surface.revealLocation(range)).toBe(true);
    expect(scrolls[0]).not.toHaveBeenCalled();
    expect(scrolls[1]).toHaveBeenCalled();
    expect(headings[1].contains(window.getSelection()?.anchorNode ?? null)).toBe(true);
    expect(surface.getMarkdown()).toBe(markdown);
  });

  it('resolves a formatted linked heading without matching rendered text or synthetic clicks', () => {
    const markdown = '# **Đọc [tài liệu](https://example.org)**\n';
    const { surface, root } = createSurface(markdown);
    root.innerHTML = '<h1 class="mu-atx-heading"><span contenteditable="true">Đọc tài liệu</span></h1>';
    const heading = root.firstElementChild as HTMLElement;
    heading.scrollIntoView = vi.fn();
    const click = vi.fn();
    heading.addEventListener('click', click);
    expect(surface.revealLocation(createDocumentIndex(markdown).outline[0].sourceRange)).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });

  it('rejects invalid or non-heading source ranges without moving the caret', () => {
    const markdown = '# Tên\n\nNội dung\n';
    const { surface, root } = createSurface(markdown);
    root.innerHTML = '<h1 class="mu-atx-heading"><span contenteditable="true">Tên</span></h1>';
    const heading = root.firstElementChild as HTMLElement;
    heading.scrollIntoView = vi.fn();
    const location = createDocumentIndex(markdown).outline[0].sourceRange;
    expect(surface.revealLocation({ ...location, from: -1 })).toBe(false);
    expect(surface.revealLocation({ ...location, from: 8, to: markdown.length })).toBe(false);
    expect(heading.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('page selection is not a Markdown edit', () => {
  it('clears a next-page caret when selecting a blockless page and does not insert a paragraph', () => {
    const { surface, visual, container, root } = createSurface('# Next\n');
    container.contentEditable = 'true';
    container.style.setProperty('--visual-page-height', '100px');
    container.style.setProperty('--visual-page-gap', '10px');
    container.style.setProperty('--visual-page-stack-height', '210px');
    root.innerHTML = '<h1><span contenteditable="true">Next</span></h1>';
    const next = root.firstElementChild as HTMLElement;
    next.getBoundingClientRect = () => new DOMRect(0, 120, 100, 20);
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(false);
    window.getSelection()?.addRange(range);

    expect(surface.selectPage(0)).toBe(true);
    expect(document.activeElement?.getAttribute('data-blank-page-input')).toBe('0');
    expect(next.contains(window.getSelection()?.anchorNode ?? null)).toBe(false);
    expect(visual.insertTopLevelBlocks).not.toHaveBeenCalled();
  });
});

describe('page chrome respects the printable body', () => {
  it('places the footer below the body boundary rather than inside the last text line', async () => {
    const editor = document.createElement('section');
    document.body.append(editor);
    Object.defineProperty(editor, 'offsetWidth', { value: 210 });
    const committed = new Promise<void>(resolve => editor.addEventListener(
      VISUAL_PAGE_LAYOUT_COMMITTED, () => resolve(), { once: true },
    ));
    const dispose = installVisualPageFlow(editor, {
      getPageDecorationSettings: () => readVisualPageDecorationSettings(''),
    });
    await committed;
    const footer = editor.querySelector<HTMLElement>('.visual-page-footer')!;
    try {
      expect(footer.style.top).toBe('219px');
      expect(footer.style.transform).not.toBe('translateY(-100%)');
    } finally {
      dispose();
    }
  });
});
