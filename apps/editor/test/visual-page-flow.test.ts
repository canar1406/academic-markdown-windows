// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  applyStructurePageFlow,
  calculatePageBreakPlacement,
  calculatePageStackPlacement,
  calculateStructurePagePlacement,
  deriveVisualPageInventory,
  installVisualPageFlow,
  VISUAL_PAGE_LAYOUT_COMMITTED,
  VISUAL_PAGE_TRANSACTION_START,
} from '../src/visual-page-flow.js';

describe('structure page flow', () => {
  it('keeps a heading with a following table when the group fits one usable page', () => {
    const editor = document.createElement('main');
    const heading = document.createElement('h2');
    heading.className = 'mu-atx-heading';
    const table = document.createElement('table');
    table.className = 'mu-table';
    editor.append(heading, table);
    const spacer = () => Number.parseFloat(heading.style.getPropertyValue('--visual-block-spacer-before')) || 0;
    applyStructurePageFlow(editor, {
      pageHeight: 100, pageGap: 10, contentTop: 10, contentBottom: 10,
      measureOffset: block => block === heading ? 60 : 75 + spacer(),
      measureHeight: block => block === heading ? 10 : 30,
    });
    expect(spacer()).toBe(50);
    expect(table.style.getPropertyValue('--visual-block-spacer-before')).toBe('0px');
    // Reflow must not accumulate the previous heading spacer.
    applyStructurePageFlow(editor, {
      pageHeight: 100, pageGap: 10, contentTop: 10, contentBottom: 10,
      measureOffset: block => block === heading ? 60 : 75 + spacer(),
      measureHeight: block => block === heading ? 10 : 30,
    });
    expect(spacer()).toBe(50);
  });

  it('rounds the editor canvas up to complete A4 sheets', () => {
    expect(calculatePageStackPlacement(3412, { pageHeight: 1154, pageGap: 24 })).toEqual({
      pageCount: 3,
      stackHeight: 3510,
    });
  });

  it('keeps a structure page at a page boundary and reserves exactly one page slot', () => {
    expect(calculateStructurePagePlacement(0, { pageHeight: 1154, pageGap: 24 })).toEqual({
      spacerBefore: 0,
      slotHeight: 1178,
    });
  });

  it('pushes a structure page in the middle of a page to the next page boundary', () => {
    expect(calculateStructurePagePlacement(400, { pageHeight: 1154, pageGap: 24 })).toEqual({
      spacerBefore: 778,
      slotHeight: 1178,
    });
  });

  it('does not create a sub-pixel blank strip near a page boundary', () => {
    expect(calculateStructurePagePlacement(1177.8, { pageHeight: 1154, pageGap: 24 })).toEqual({
      spacerBefore: 0,
      slotHeight: 1178,
    });
  });

  it('writes a full-page slot onto cover, TOC, list-of-figures, and list-of-tables blocks', () => {
    const editor = document.createElement('main');
    const names = ['cover', 'toc', 'list-of-figures', 'list-of-tables'];
    const pages = names.map((name) => {
      const page = document.createElement('section');
      page.className = 'mu-lmx-structure';
      page.dataset.lmxName = name;
      editor.append(page);
      return page;
    });

    applyStructurePageFlow(editor, {
      pageHeight: 1154,
      pageGap: 24,
      measureOffset: () => 400,
    });

    for (const page of pages) {
      expect(page.style.getPropertyValue('--visual-page-spacer-before')).toBe('778px');
      expect(page.style.getPropertyValue('--visual-page-slot-height')).toBe('1178px');
    }
  });

  it('fills the remaining space before a pagebreak marker so the next block starts on the next A4 page', () => {
    expect(calculatePageBreakPlacement(400, { pageHeight: 1154, pageGap: 24 })).toEqual({
      pagebreakHeight: 778,
      slotHeight: 1178,
    });
  });

  it('does not skip an extra A4 sheet when a pagebreak is already at a boundary', () => {
    expect(calculatePageBreakPlacement(1178, { pageHeight: 1154, pageGap: 24 })).toEqual({
      pagebreakHeight: 0,
      slotHeight: 1178,
    });
  });

  it('consumes one blank A4 sheet for a consecutive pagebreak at a boundary', () => {
    expect(calculatePageBreakPlacement(
      1178,
      { pageHeight: 1154, pageGap: 24 },
      { consumeBoundaryPage: true },
    )).toEqual({
      pagebreakHeight: 1178,
      slotHeight: 1178,
    });
  });

  it('writes the remaining-page height onto pagebreak blocks', () => {
    const editor = document.createElement('main');
    const pageBreak = document.createElement('section');
    pageBreak.className = 'mu-lmx-structure';
    pageBreak.dataset.lmxName = 'pagebreak';
    editor.append(pageBreak);

    applyStructurePageFlow(editor, {
      pageHeight: 1154,
      pageGap: 24,
      measureOffset: () => 400,
    });

    expect(pageBreak.style.getPropertyValue('--visual-pagebreak-height')).toBe('778px');
    expect(pageBreak.style.getPropertyValue('--visual-page-slot-height')).toBe('');
  });

  it('reserves a complete A4 slot for a pagebreak that follows another pagebreak at a boundary', () => {
    const editor = document.createElement('main');
    const firstPageBreak = document.createElement('section');
    firstPageBreak.className = 'mu-lmx-structure';
    firstPageBreak.dataset.lmxName = 'pagebreak';
    const secondPageBreak = firstPageBreak.cloneNode() as HTMLElement;
    editor.append(firstPageBreak, secondPageBreak);

    applyStructurePageFlow(editor, {
      pageHeight: 1154,
      pageGap: 24,
      measureOffset: () => 1178,
    });

    expect(firstPageBreak.style.getPropertyValue('--visual-pagebreak-height')).toBe('1178px');
    expect(secondPageBreak.style.getPropertyValue('--visual-pagebreak-height')).toBe('1178px');
  });

  it('commits layout after every explicit page transaction start', async () => {
    const stage = document.createElement('div');
    stage.className = 'editor-stage';
    const editor = document.createElement('main');
    editor.style.setProperty('--visual-page-gap', '10px');
    editor.style.setProperty('--visual-page-content-top', '10px');
    editor.style.setProperty('--visual-page-content-bottom', '10px');
    Object.defineProperty(editor, 'offsetWidth', { configurable: true, value: 210 });
    const root = document.createElement('div');
    root.className = 'mu-container';
    root.append(document.createElement('p'));
    editor.append(root);
    stage.append(editor);
    document.body.append(stage);
    let commits = 0;
    editor.addEventListener(VISUAL_PAGE_LAYOUT_COMMITTED, () => { commits += 1; });
    const dispose = installVisualPageFlow(editor);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const initialCommits = commits;
      editor.dispatchEvent(new Event(VISUAL_PAGE_TRANSACTION_START));
      await new Promise<void>(resolve => queueMicrotask(resolve));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      expect(commits).toBe(initialCommits + 1);
    }
    finally {
      dispose();
      stage.remove();
    }
  });

  it('derives transient page cards from A4 geometry and top-level blocks', () => {
    const editor = document.createElement('main');
    editor.style.setProperty('--visual-page-height', '100px');
    editor.style.setProperty('--visual-page-gap', '10px');
    editor.style.setProperty('--visual-page-stack-height', '320px');
    Object.defineProperty(editor, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 320, left: 0, right: 210, width: 210, height: 320 }),
    });
    const root = document.createElement('div');
    root.className = 'mu-container';
    editor.append(root);
    const block = document.createElement('p');
    block.textContent = 'Nội dung';
    Object.defineProperty(block, 'getBoundingClientRect', {
      value: () => ({ top: 180, bottom: 210, left: 0, right: 200, width: 200, height: 30 }),
    });
    root.append(block);

    const pages = deriveVisualPageInventory(editor);
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.kind)).toEqual(['blank', 'content', 'blank']);
    expect(pages[0]).toMatchObject({ pageIndex: 0, blockCount: 0, blockIndices: [], insertAfterIndex: -1 });
    expect(pages[1]).toMatchObject({ pageIndex: 1, blockCount: 1, blockIndices: [0], insertAfterIndex: 0 });
    expect(pages[2]).toMatchObject({ pageIndex: 2, kind: 'blank', insertAfterIndex: 0 });
  });

  it('does not make a page deletable when its top-level block spans another page', () => {
    const editor = document.createElement('main');
    editor.style.setProperty('--visual-page-height', '100px');
    editor.style.setProperty('--visual-page-gap', '10px');
    editor.style.setProperty('--visual-page-stack-height', '210px');
    Object.defineProperty(editor, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 210, left: 0, right: 210, width: 210, height: 210 }),
    });
    const root = document.createElement('div');
    root.className = 'mu-container';
    editor.append(root);
    const block = document.createElement('pre');
    Object.defineProperty(block, 'getBoundingClientRect', {
      value: () => ({ top: 10, bottom: 200, left: 0, right: 200, width: 200, height: 190 }),
    });
    root.append(block);

    const pages = deriveVisualPageInventory(editor);
    expect(pages[0]).toMatchObject({ blockIndices: [0], deletable: false });
    expect(pages[1]).toMatchObject({ blockIndices: [0], deletable: false });
  });

  it('maps a pagebreak to the blank A4 page it creates so that page is deletable', () => {
    const editor = document.createElement('main');
    editor.style.setProperty('--visual-page-height', '100px');
    editor.style.setProperty('--visual-page-gap', '10px');
    editor.style.setProperty('--visual-page-stack-height', '210px');
    Object.defineProperty(editor, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 210, left: 0, right: 210, width: 210, height: 210 }),
    });
    const root = document.createElement('div');
    root.className = 'mu-container';
    editor.append(root);
    const pagebreak = document.createElement('section');
    pagebreak.dataset.lmxName = 'pagebreak';
    Object.defineProperty(pagebreak, 'getBoundingClientRect', {
      value: () => ({ top: 50, bottom: 110, left: 0, right: 200, width: 200, height: 60 }),
    });
    root.append(pagebreak);

    const pages = deriveVisualPageInventory(editor);
    expect(pages[0]).toMatchObject({ kind: 'blank', deletable: false, blockIndices: [] });
    expect(pages[1]).toMatchObject({
      kind: 'blank',
      deletable: true,
      blockCount: 1,
      blockIndices: [0],
      title: 'Trang 2 (trống)',
    });
  });

});
