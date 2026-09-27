// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '@markdown/muya-core';
import { BlockSelectAll } from '../src/block-select-all.js';

describe('Visual block select-all plugin', () => {
  let muya: Muya;
  const source = 'Tiếng Việt.\n\nĐoạn hai.\n';

  beforeEach(() => {
    const host = document.createElement('section');
    document.body.append(host);
    muya = new Muya(host);
    muya.init();
    new BlockSelectAll(muya);
    muya.setContent(source);
    const block = muya.editor.scrollPage?.firstContentInDescendant();
    if (!block) throw new Error('Expected first paragraph');
    muya.editor.selection.setSelection({
      block, path: block.path, anchor: { offset: 2 }, focus: { offset: 2 },
    });
  });

  afterEach(() => {
    muya.destroy();
    document.body.replaceChildren();
  });

  function press(options: KeyboardEventInit = {}, target: HTMLElement = muya.domNode): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: 'a', ctrlKey: true, bubbles: true, cancelable: true, ...options,
    });
    target.dispatchEvent(event);
    return event;
  }

  it.each([
    { ctrlKey: true, metaKey: false },
    { ctrlKey: false, metaKey: true },
  ])('uses live block selection for %j, including backward selection and cursor reset', (modifiers) => {
    expect(press(modifiers).defaultPrevented).toBe(true);
    expect(document.getSelection()?.toString()).toBe('Tiếng Việt.');
    const selection = document.getSelection();
    const first = selection?.anchorNode;
    if (!first) throw new Error('Expected text selection');
    // Move the DOM selection without synchronizing Muya's cached cursor.
    selection?.setBaseAndExtent(first, 11, first, 0);
    expect(selection?.toString()).toBe('Tiếng Việt.');
    press(modifiers);
    expect(muya.editor.selection.getSelection()?.isSelectionInSameBlock).toBe(false);
    selection?.setPosition(first, 3);
    press(modifiers);
    expect(document.getSelection()?.toString()).toBe('Tiếng Việt.');
    expect(muya.getMarkdown()).toBe(source);
  });

  it.each(['input', 'textarea', 'select', 'button'])('does not claim a native %s shortcut', (tag) => {
    const input = document.createElement(tag);
    muya.domNode.append(input);
    input.focus();
    expect(press({}, input).defaultPrevented).toBe(false);
    expect(document.getSelection()?.isCollapsed).toBe(true);
  });

  it('does not claim metadata or nested source contenteditables', () => {
    const metadata = document.createElement('div');
    metadata.setAttribute('contenteditable', 'false');
    const field = document.createElement('div');
    field.setAttribute('contenteditable', 'true');
    metadata.append(field);
    muya.domNode.append(metadata);
    expect(press({}, field).defaultPrevented).toBe(false);
    const sourceEditor = document.createElement('div');
    sourceEditor.className = 'cm-editor';
    sourceEditor.setAttribute('contenteditable', 'true');
    muya.domNode.append(sourceEditor);
    expect(press({}, sourceEditor).defaultPrevented).toBe(false);
  });

  it.each([
    { ctrlKey: false, metaKey: false },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
    { key: 'b', metaKey: true },
  ])('does not claim a different shortcut or composition: %j', (options) => {
    expect(press(options).defaultPrevented).toBe(false);
  });

  it('does not claim shortcuts while Visual is hidden', () => {
    muya.domNode.style.display = 'none';
    expect(press().defaultPrevented).toBe(false);
  });

  it('does not claim a stale selection outside Visual', () => {
    const field = document.createElement('div');
    field.textContent = 'Outside';
    document.body.append(field);
    document.getSelection()?.setPosition(field.firstChild, 1);
    expect(press().defaultPrevented).toBe(false);
  });

  it('keeps repeated Control modifiers from reaching the cross-block cut handler', () => {
    press();
    press();
    press({ key: 'Control' });
    press();
    expect(muya.getMarkdown()).toBe(source);
    expect(muya.editor.selection.getSelection()?.isSelectionInSameBlock).toBe(false);
  });
});
